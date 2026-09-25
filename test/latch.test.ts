import { afterEach, describe, expect, it } from 'vitest'

import { destroyMounted, mountInstance, PARAMS } from './helpers'

/**
 * Delivering a result exactly once per attempt.
 *
 * The result travels three paths on purpose — a same-origin BroadcastChannel from the return
 * page, a post to `window.opener`, and one to `opener.parent` — because any single one can be
 * severed. So arriving twice is expected and correct. Delivering twice is not: it is how a
 * merchant fulfils one order two times.
 */

afterEach(() => {
  destroyMounted()
})

describe('one result per attempt', () => {
  it('delivers once however many copies arrive', () => {
    // Delivered straight to the instance: which block a message belongs to is
    // `routing.test.ts`'s subject, not this file's.
    const { instance, handlers } = mountInstance('cks_a')
    instance.handle({ type: 'suqo:gateway' })

    for (let i = 0; i < 3; i++) {
      instance.handle({ type: 'suqo:result', status: 'success', params: PARAMS })
    }

    expect(handlers.onSuccess).toHaveBeenCalledOnce()
    expect(handlers.onSuccess).toHaveBeenCalledWith(PARAMS, undefined)
  })

  it('latches a cancellation too', () => {
    const { instance, handlers } = mountInstance('cks_a')
    instance.handle({ type: 'suqo:gateway' })

    instance.handle({ type: 'suqo:result', status: 'cancelled', params: {} })
    instance.handle({ type: 'suqo:result', status: 'cancelled', params: {} })

    expect(handlers.onFailure).toHaveBeenCalledOnce()
  })

  it('releases the latch for a genuine second attempt', () => {
    // A new gateway window is a real retry, not a duplicate of the first result.
    const { instance, handlers } = mountInstance('cks_a')

    instance.handle({ type: 'suqo:gateway' })
    instance.handle({ type: 'suqo:result', status: 'cancelled', params: {} })

    instance.handle({ type: 'suqo:gateway' })
    instance.handle({ type: 'suqo:result', status: 'success', params: PARAMS })

    expect(handlers.onFailure).toHaveBeenCalledOnce()
    expect(handlers.onSuccess).toHaveBeenCalledOnce()
  })
})

describe('what the callbacks receive', () => {
  it('keeps cancelled distinct from failed', () => {
    // A buyer who backed out wants the basket offered again; a rejected payment wants looking
    // into. Collapsing them loses the only signal that tells them apart.
    const { instance, handlers } = mountInstance('cks_a')
    instance.handle({ type: 'suqo:gateway' })

    instance.handle({ type: 'suqo:result', status: 'cancelled', params: PARAMS })

    expect(handlers.onFailure).toHaveBeenCalledWith('cancelled', PARAMS, undefined)
  })

  it('passes the backend’s own sentence through when there is one', () => {
    const { instance, handlers } = mountInstance('cks_a')
    instance.handle({ type: 'suqo:gateway' })

    instance.handle({
      type: 'suqo:result',
      status: 'failed',
      params: PARAMS,
      message: 'Card declined.',
    })

    expect(handlers.onFailure).toHaveBeenCalledWith('failed', PARAMS, 'Card declined.')
  })

  it('never calls onFailure for an unavailable session', () => {
    // No payment was attempted. onFailure would tell the merchant one was made and rejected.
    const { instance, handlers } = mountInstance('cks_a')

    instance.handle({ type: 'suqo:unavailable', reason: 'no-customer' })

    expect(handlers.onUnavailable).toHaveBeenCalledWith('no-customer')
    expect(handlers.onFailure).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
  })
})
