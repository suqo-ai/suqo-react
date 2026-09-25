import { afterEach, describe, expect, it, vi } from 'vitest'

import { instanceCount } from '../src/registry'

import { destroyMounted, mountInstance, ORIGIN, PARAMS, post } from './helpers'

/**
 * Which block a message belongs to.
 *
 * Everything except `suqo:result` is matched by `event.source` against the instance's own
 * iframe. `suqo:result` cannot be — it arrives from the *gateway window*, which is nobody's
 * frame — so it is matched by which block has an attempt in flight instead. That asymmetry is
 * the whole reason the dispatcher is page-wide rather than per-component.
 */

afterEach(() => {
  destroyMounted()
  vi.restoreAllMocks()
})

describe('the page listener', () => {
  it('is attached once however many blocks are mounted, and removed with the last', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const first = mountInstance('cks_a')
    const second = mountInstance('cks_b')

    expect(instanceCount()).toBe(2)
    expect(add.mock.calls.filter(([type]) => type === 'message')).toHaveLength(1)

    first.instance.destroyNow()
    expect(remove.mock.calls.filter(([type]) => type === 'message')).toHaveLength(0)

    second.instance.destroyNow()
    expect(instanceCount()).toBe(0)
    expect(remove.mock.calls.filter(([type]) => type === 'message')).toHaveLength(1)
  })
})

describe('frame-routed messages', () => {
  it('reach only the block whose iframe sent them', () => {
    const a = mountInstance('cks_a')
    const b = mountInstance('cks_b')

    post({ type: 'suqo:ready' }, { source: a.iframe.contentWindow })

    expect(a.handlers.onReady).toHaveBeenCalledOnce()
    expect(b.handlers.onReady).not.toHaveBeenCalled()
  })

  it('are dropped when no block owns the sender', () => {
    const a = mountInstance('cks_a')

    post({ type: 'suqo:ready' }, { source: null })

    expect(a.handlers.onReady).not.toHaveBeenCalled()
  })

  it('are dropped when the origin is not the frame’s', () => {
    const a = mountInstance('cks_a')

    post({ type: 'suqo:ready' }, { source: a.iframe.contentWindow, origin: 'https://evil.example' })

    expect(a.handlers.onReady).not.toHaveBeenCalled()
  })
})

describe('the result', () => {
  it('goes to the block with an attempt in flight, not the one that sent nothing', () => {
    const a = mountInstance('cks_a')
    const b = mountInstance('cks_b')
    b.instance.handle({ type: 'suqo:gateway' })

    // No source at all: this is what a gateway window's post looks like from here.
    post({ type: 'suqo:result', status: 'success', params: PARAMS }, { source: null })

    expect(b.handlers.onSuccess).toHaveBeenCalledOnce()
    expect(a.handlers.onSuccess).not.toHaveBeenCalled()
  })

  it('reaches the sole block on the page even with no attempt recorded', () => {
    // One block is unambiguous, and losing a real result to bookkeeping would be worse than
    // the theoretical mis-routing this avoids.
    const a = mountInstance('cks_a')

    post({ type: 'suqo:result', status: 'success', params: PARAMS }, { source: null })

    expect(a.handlers.onSuccess).toHaveBeenCalledOnce()
  })

  it('is dropped when two blocks are mounted and neither is awaiting', () => {
    const a = mountInstance('cks_a')
    const b = mountInstance('cks_b')

    post({ type: 'suqo:result', status: 'success', params: PARAMS }, { source: null })

    expect(a.handlers.onSuccess).not.toHaveBeenCalled()
    expect(b.handlers.onSuccess).not.toHaveBeenCalled()
  })

  it('is origin-checked like everything else', () => {
    const a = mountInstance('cks_a')
    a.instance.handle({ type: 'suqo:gateway' })

    post(
      { type: 'suqo:result', status: 'success', params: PARAMS },
      { source: null, origin: 'https://evil.example' }
    )

    expect(a.handlers.onSuccess).not.toHaveBeenCalled()
  })
})

describe('foreign traffic', () => {
  it('is ignored — a merchant’s page is full of other postMessage senders', () => {
    const a = mountInstance('cks_a')

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'some-analytics-widget', type: 'suqo:ready' },
        origin: ORIGIN,
        source: a.iframe.contentWindow,
      })
    )

    expect(a.handlers.onReady).not.toHaveBeenCalled()
  })
})

describe('a destroyed block', () => {
  it('stops receiving anything', () => {
    const a = mountInstance('cks_a')
    a.instance.destroyNow()

    post({ type: 'suqo:ready' }, { source: a.iframe.contentWindow })

    expect(a.handlers.onReady).not.toHaveBeenCalled()
  })
})
