import { warn } from './warn'

/**
 * Validating a `suqo:redirect` payload, and the one place this package writes
 * `window.location`.
 *
 * The frame asks for this navigation because it has discovered there is no popup and cannot
 * reach the top-level context itself — its sandbox deliberately omits
 * `allow-top-navigation-by-user-activation`. We are not sandboxed, so we can.
 */

/**
 * The href to navigate to, or null.
 *
 * Three checks, in this order:
 *   1. it must parse
 *   2. it must be http(s)
 *   3. **its origin must equal the frame's**
 *
 * Step 3 is the one that matters, and `event.origin` does not replace it: that proves the
 * checkout origin *asked*, not that what it asked for is safe. Without step 3 any reflected
 * value inside the checkout app becomes an open redirect on every merchant page embedding
 * this package — a far better exploit than the same bug confined to one origin.
 *
 * Step 2 is subsumed by step 3 (`new URL('javascript:…').origin` is `"null"`) and kept anyway,
 * because a security reviewer reading this should find one line rather than a footnote.
 *
 * Relative payloads resolve against the frame origin rather than the merchant's page. The
 * same-origin check is unchanged either way; resolving against the merchant would silently
 * refuse a legitimate relative `/checkout/cks_…`.
 */
export function validateRedirectUrl(raw: unknown, frameOrigin: string): string | null {
  if (typeof raw !== 'string' || raw === '') return null

  let parsed: URL
  try {
    parsed = new URL(raw, frameOrigin)
  } catch {
    warn(`ignoring an unparseable redirect url: ${raw}`)
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    warn(`refusing a non-http(s) redirect url: ${raw}`)
    return null
  }

  if (parsed.origin !== frameOrigin) {
    warn(`refusing a cross-origin redirect url: ${raw}`)
    return null
  }

  return parsed.href
}

/**
 * A seam, deliberately.
 *
 * jsdom throws "Not implemented: navigation" on any `location` write, so the only way to test
 * everything around this call is for the call itself to be mockable.
 *
 * `href`, not `replace`: the merchant's page stays in history, so Back returns the buyer to
 * the shop rather than stranding them on the hosted checkout.
 */
export function navigateTopLevel(href: string): void {
  window.location.href = href
}
