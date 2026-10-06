import { warn } from './warn'

/**
 * Validating a `suqo:intent` payload.
 *
 * The opposite shape from `navigate.ts`'s `validateRedirectUrl`, deliberately: that one
 * requires http(s) and same-origin, because it is this package navigating somewhere. This
 * one never navigates anywhere — the url is handed to the merchant's own `onIntent`, on
 * their own page, under their own trust boundary — so there is no origin to check it
 * against and no reason to require http(s). A non-http(s) scheme (`intent://…`,
 * `fonepayApp://…`) is the whole point of this message.
 *
 * The one thing still refused unconditionally: `javascript:`, `data:`, `file:` and `blob:`.
 * That has nothing to do with whether the frame can be trusted — it is about what a
 * merchant's `location.href = url` does structurally for each of those, independent of who
 * asked. Same blocklist `js-checkout`'s loader and `suqo-react-native`'s navigation
 * classifier both use, so a scheme is treated identically across every SDK.
 */

const BLOCKED_SCHEMES: ReadonlySet<string> = new Set(['javascript', 'data', 'file', 'blob'])

export function validateIntentUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    // A schemeless or relative value (`payment/?x=1`) has no scheme to check, but is also
    // not a deeplink — nothing this merchant's `location.href` could do anything useful
    // with. Refused rather than guessed at.
    warn(`ignoring an unparseable intent url: ${raw}`)
    return null
  }

  const scheme = parsed.protocol.replace(/:$/, '')
  if (BLOCKED_SCHEMES.has(scheme)) {
    warn(`refusing to forward an intent url with scheme: ${scheme}`)
    return null
  }

  return raw
}
