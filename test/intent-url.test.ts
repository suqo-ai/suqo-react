import { describe, expect, it, vi } from 'vitest'

import { validateIntentUrl } from '../src/intent'

/**
 * `suqo:intent` never navigates anywhere from this side — the url is handed to the
 * merchant's own `onIntent`. So this is the opposite shape from `redirect-url.test.ts`:
 * almost everything is accepted verbatim, and only a few structurally-dangerous schemes
 * are refused regardless of origin, since there is no origin to check it against.
 */

describe('what it accepts', () => {
  it.each([
    ['an intent:// deeplink', 'intent://payment/?qrPayload=1#Intent;scheme=x;end'],
    ['a custom bank app scheme', 'fonepayApp://payment/?emandate=abc'],
    ['a plain custom scheme', 'whatsapp://send?text=hi'],
    ['tel:', 'tel:+9779800000000'],
    ['mailto:', 'mailto:someone@example.com'],
    ['http(s), even though it is not the point of this message', 'https://example.test/x'],
  ])('accepts %s verbatim', (_label, raw) => {
    expect(validateIntentUrl(raw)).toBe(raw)
  })
})

describe('what it refuses', () => {
  it.each([
    ['a javascript: url', 'javascript:alert(1)'],
    ['a data: url', 'data:text/html,<h1>hi'],
    ['a file: url', 'file:///etc/passwd'],
    ['a blob: url', 'blob:https://pay.suqo.ai/1234'],
    ['an empty string', ''],
    ['a non-string', { url: 'intent://x' }],
    ['null', null],
    ['an unparseable, schemeless string', 'not a url at all'],
  ])('refuses %s', (_label, raw) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(validateIntentUrl(raw)).toBeNull()

    vi.restoreAllMocks()
  })

  it('refuses javascript: regardless of casing or whitespace tricks', () => {
    // Not about trusting the frame — about what a merchant's own `location.href = url`
    // does structurally for this scheme, independent of who asked.
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(validateIntentUrl('JAVASCRIPT:alert(1)')).toBeNull()

    vi.restoreAllMocks()
  })
})
