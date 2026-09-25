import { describe, expect, it, vi } from 'vitest'

import { validateRedirectUrl } from '../src/navigate'

/**
 * The security file.
 *
 * `suqo:redirect` is the only message that asks this package to *act* rather than to observe,
 * and the only one whose payload is validated. Everything here is an attempt to get a
 * navigation somewhere the checkout origin does not control.
 */

const FRAME_ORIGIN = 'https://pay.suqo.ai'

describe('what it accepts', () => {
  it('takes an absolute URL on the frame origin', () => {
    expect(validateRedirectUrl(`${FRAME_ORIGIN}/checkout/cks_abc`, FRAME_ORIGIN)).toBe(
      `${FRAME_ORIGIN}/checkout/cks_abc`
    )
  })

  it('resolves a relative path against the frame origin', () => {
    expect(validateRedirectUrl('/checkout/cks_abc', FRAME_ORIGIN)).toBe(
      `${FRAME_ORIGIN}/checkout/cks_abc`
    )
  })
})

describe('what it refuses', () => {
  it.each([
    ['a different origin', 'https://evil.example/steal'],
    ['a javascript: url', 'javascript:alert(1)'],
    ['a data: url', 'data:text/html,<h1>hi'],
    ['a blob: url', 'blob:https://pay.suqo.ai/1234'],
    ['a protocol-relative url', '//evil.example/steal'],
    ['a prefix that merely looks like the origin', 'https://pay.suqo.ai.evil.example/steal'],
    ['an empty string', ''],
    ['a non-string', { url: 'https://pay.suqo.ai/x' }],
    ['null', null],
    ['a mailto: url', 'mailto:someone@example.com'],
  ])('refuses %s', (_label, raw) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(validateRedirectUrl(raw, FRAME_ORIGIN)).toBeNull()

    vi.restoreAllMocks()
  })

  it('accepts an odd but same-origin path, because that is the checkout origin’s business', () => {
    // Resolved against a base, almost any string is a valid relative path — `::::` becomes
    // `/::::`. That is not a hole: the guarantee this function makes is *same-origin*, and a
    // path the checkout origin does not serve is a 404 there, not a redirect elsewhere.
    expect(validateRedirectUrl('::::', FRAME_ORIGIN)).toBe(`${FRAME_ORIGIN}/::::`)
  })

  it('refuses a cross-origin url even though the sender was the checkout origin', () => {
    // This is the whole point. The caller has already checked `event.origin`, which proves
    // the checkout origin *asked* — not that what it asked for is safe. Without this check a
    // reflected value inside the checkout app becomes an open redirect on every merchant
    // page embedding this package.
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(validateRedirectUrl('https://evil.example/steal', FRAME_ORIGIN)).toBeNull()

    vi.restoreAllMocks()
  })
})
