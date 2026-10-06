/**
 * Building the two URLs this package needs, and nothing else.
 *
 * Neither function reads `window`. The caller passes the parent origin in, which is what lets
 * every one of these be unit-tested and what keeps the module importable on a server.
 */

/** Where a live checkout is served from. */
export const LIVE_ORIGIN = 'https://app.suqo.ai'

/** Where a sandbox checkout is served from. */
export const SANDBOX_ORIGIN = 'https://test.suqo.ai'

/**
 * Where the checkout is served from when the merchant names no origin.
 *
 * The vanilla loader derives this from its own `<script src>`; a bundled package has no
 * script tag, so a compiled-in constant is the only option. Exported so the value is
 * greppable rather than folklore.
 *
 * @deprecated Equal to {@link SANDBOX_ORIGIN}. Prefer the `mode` prop.
 */
export const DEFAULT_ORIGIN = SANDBOX_ORIGIN

/** The two checkout environments a merchant can pick between without naming a URL. */
export type CheckoutMode = 'live' | 'sandbox'

function originForMode(mode: CheckoutMode | undefined): string {
  return mode === 'live' ? LIVE_ORIGIN : SANDBOX_ORIGIN
}

/**
 * Resolves the checkout origin.
 *
 * An explicit `origin` always wins — it is how a merchant points at something other than
 * `app.suqo.ai` / `test.suqo.ai` (a staging mirror, a proxy). Otherwise `mode` picks between
 * {@link LIVE_ORIGIN} and {@link SANDBOX_ORIGIN}, defaulting to sandbox so an integration that
 * names neither cannot accidentally take a live payment.
 */
export function normaliseOrigin(origin: string | undefined, mode?: CheckoutMode): string {
  if (typeof origin === 'string') {
    // Whitespace as well as slashes: these arrive from JSX props and env vars, and a stray
    // space survives into the URL string even though the URL parser tolerates it.
    const trimmed = origin.replace(/^\s+|\s+$/g, '').replace(/\/+$/, '')
    if (trimmed !== '') return trimmed
  }
  return originForMode(mode)
}

/**
 * The frame URL: `<origin>/c/<sessionId>#parentOrigin=<encoded>`.
 *
 * The parent origin rides in the **hash**, never the query string. NPS appends its own return
 * params with a literal `?` instead of `&`, so anything added to a query string that reaches
 * a gateway comes back mangled and swallows the gateway's own transaction id. A hash never
 * leaves the browser.
 */
export function frameUrl(origin: string, sessionId: string, parentOrigin: string): string {
  return `${origin}/c/${encodeURIComponent(sessionId)}#parentOrigin=${encodeURIComponent(parentOrigin)}`
}

/**
 * The hosted continuation of the same session: `<origin>/checkout/<sessionId>`.
 *
 * Same id, no conversion call — that is what makes both fallback paths free. It is where the
 * failure panel points and where `suqo:redirect` sends a buyer with no popup.
 */
export function hostedCheckoutUrl(origin: string, sessionId: string): string {
  return `${origin}/checkout/${encodeURIComponent(sessionId)}`
}
