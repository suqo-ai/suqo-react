import { describe, expect, it } from 'vitest'

import { MESSAGE_SOURCE, parseMessage } from '../src/protocol'

/** An envelope as the frame sends it. */
const envelope = (fields: Record<string, unknown>) => ({ source: MESSAGE_SOURCE, ...fields })

describe('the envelope', () => {
  it.each([
    ['a foreign source', { source: 'something-else', type: 'suqo:ready' }],
    ['no source at all', { type: 'suqo:ready' }],
    ['a string', 'suqo:ready'],
    ['null', null],
    ['an unknown type', envelope({ type: 'suqo:whatever' })],
  ])('drops %s', (_label, data) => {
    // A merchant's page is full of unrelated postMessage traffic — analytics, chat widgets,
    // other embeds. Anything without our tag is not ours to interpret.
    expect(parseMessage(data)).toBeNull()
  })
})

describe('the signal messages', () => {
  it.each(['suqo:alive', 'suqo:ready', 'suqo:gateway'])('narrows %s', (type) => {
    expect(parseMessage(envelope({ type }))).toEqual({ type })
  })
})

describe('suqo:resize', () => {
  it('takes a usable height', () => {
    expect(parseMessage(envelope({ type: 'suqo:resize', height: 412 }))).toEqual({
      type: 'suqo:resize',
      height: 412,
    })
  })

  it.each([
    ['zero', 0],
    ['negative', -10],
    ['NaN', Number.NaN],
    ['a non-numeric string', 'tall'],
    ['missing', undefined],
  ])('drops a %s height rather than writing it to the iframe', (_label, height) => {
    expect(parseMessage(envelope({ type: 'suqo:resize', height }))).toBeNull()
  })
})

describe('suqo:redirect', () => {
  it('takes a url', () => {
    expect(parseMessage(envelope({ type: 'suqo:redirect', url: 'https://x.test/y' }))).toEqual({
      type: 'suqo:redirect',
      url: 'https://x.test/y',
    })
  })

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['a non-string', 42],
  ])('drops a %s url', (_label, url) => {
    expect(parseMessage(envelope({ type: 'suqo:redirect', url }))).toBeNull()
  })
})

describe('suqo:unavailable', () => {
  it.each(['not-found', 'expired', 'spent', 'no-customer', 'no-methods', 'load-failed'])(
    'round-trips %s',
    (reason) => {
      expect(parseMessage(envelope({ type: 'suqo:unavailable', reason }))).toEqual({
        type: 'suqo:unavailable',
        reason,
      })
    }
  )

  it('drops a reason it does not recognise rather than widening the union', () => {
    // Letting an arbitrary string through would make every merchant's `switch` on
    // UnavailableReason non-exhaustive, for a value we never send.
    expect(parseMessage(envelope({ type: 'suqo:unavailable', reason: 'vibes' }))).toBeNull()
  })
})

describe('suqo:result', () => {
  it.each(['success', 'failed', 'cancelled'])('round-trips %s', (status) => {
    expect(parseMessage(envelope({ type: 'suqo:result', status, params: { pidx: 'k1' } }))).toEqual(
      { type: 'suqo:result', status, params: { pidx: 'k1' } }
    )
  })

  it('drops a status it does not recognise', () => {
    expect(parseMessage(envelope({ type: 'suqo:result', status: 'maybe', params: {} }))).toBeNull()
  })

  it('passes the gateway params through verbatim', () => {
    // Every gateway names its transaction id differently and the merchant reconciles against
    // what their own backend recorded. Renaming anything here throws away the only field
    // they can match on.
    const params = { data: 'e1', pidx: 'k2', MerchantTxnId: 'n3', TXNID: 'c4' }

    expect(parseMessage(envelope({ type: 'suqo:result', status: 'success', params }))).toEqual({
      type: 'suqo:result',
      status: 'success',
      params,
    })
  })

  it('drops non-string params rather than stringifying them', () => {
    // "[object Object]" in a reconciliation field is worse than a missing field.
    const parsed = parseMessage(
      envelope({
        type: 'suqo:result',
        status: 'success',
        params: { good: 'yes', nested: { a: 1 }, count: 7, nothing: null },
      })
    )

    expect(parsed).toEqual({ type: 'suqo:result', status: 'success', params: { good: 'yes' } })
  })

  it('omits message entirely when the backend said nothing', () => {
    // `undefined` must be distinguishable from a real sentence: the merchant should never be
    // handed copy this package invented.
    const parsed = parseMessage(envelope({ type: 'suqo:result', status: 'failed', params: {} }))

    expect(parsed).not.toHaveProperty('message')
  })

  it.each([
    ['a blank string', ''],
    ['a non-string', 42],
  ])('omits message for %s', (_label, message) => {
    const parsed = parseMessage(
      envelope({ type: 'suqo:result', status: 'failed', params: {}, message })
    )

    expect(parsed).not.toHaveProperty('message')
  })

  it('keeps the backend’s own sentence when it sent one', () => {
    expect(
      parseMessage(
        envelope({ type: 'suqo:result', status: 'failed', params: {}, message: 'Card declined.' })
      )
    ).toEqual({ type: 'suqo:result', status: 'failed', params: {}, message: 'Card declined.' })
  })
})
