import { describe, expect, it } from 'vitest'

import { DEFAULT_ORIGIN, frameUrl, hostedCheckoutUrl, normaliseOrigin } from '../src/urls'

const MERCHANT = 'https://merchant.example'

describe('normaliseOrigin', () => {
  it('falls back to the default when the merchant names no origin', () => {
    expect(normaliseOrigin(undefined)).toBe(DEFAULT_ORIGIN)
    expect(normaliseOrigin('')).toBe(DEFAULT_ORIGIN)
  })

  it('strips trailing slashes, so the built path never doubles one', () => {
    expect(normaliseOrigin('https://pay.suqo.ai/')).toBe('https://pay.suqo.ai')
    expect(normaliseOrigin('https://pay.suqo.ai///')).toBe('https://pay.suqo.ai')
  })

  it('strips surrounding whitespace — these arrive from env vars and JSX props', () => {
    // The URL parser tolerates a stray space; string concatenation does not.
    expect(normaliseOrigin('  https://pay.suqo.ai  ')).toBe('https://pay.suqo.ai')
    expect(normaliseOrigin('   ')).toBe(DEFAULT_ORIGIN)
  })
})

describe('frameUrl', () => {
  it('points at /c/<id> with the parent origin in the hash', () => {
    expect(frameUrl('https://pay.suqo.ai', 'cks_abc', MERCHANT)).toBe(
      `https://pay.suqo.ai/c/cks_abc#parentOrigin=${encodeURIComponent(MERCHANT)}`
    )
  })

  it('never puts the parent origin in the query string', () => {
    // NPS appends its own return params with a literal `?` instead of `&`, so anything in a
    // query string that reaches a gateway comes back mangled and swallows its transaction id.
    const url = frameUrl('https://pay.suqo.ai', 'cks_abc', MERCHANT)

    expect(url).not.toContain('?')
    expect(url.indexOf('#')).toBeGreaterThan(-1)
  })

  it('encodes a session id that would otherwise change the path', () => {
    expect(frameUrl('https://pay.suqo.ai', 'a/b?c#d', MERCHANT)).toContain('/c/a%2Fb%3Fc%23d')
  })
})

describe('hostedCheckoutUrl', () => {
  it('is the same id on the hosted route — no conversion call', () => {
    expect(hostedCheckoutUrl('https://pay.suqo.ai', 'cks_abc')).toBe(
      'https://pay.suqo.ai/checkout/cks_abc'
    )
  })
})
