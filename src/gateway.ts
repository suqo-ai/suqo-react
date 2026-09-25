/**
 * The gateway window — the one the frame opened for the buyer to pay in.
 *
 * This package never opens it. The Pay button lives inside the iframe, and a click there is a
 * user gesture in that document and nowhere else; by the time we hear `suqo:gateway` over
 * postMessage the gesture is spent and our own `window.open` would be a popup-blocker
 * violation. All we can do is close one that has outlived the page.
 */

/** Both halves of the protocol must agree on this string, or the handle cannot be taken. */
export const GATEWAY_WINDOW_NAME = 'suqo_gateway'

/**
 * Closes a gateway window that outlived the page that started it.
 *
 * A payable window with nothing left to report back to is worse than no window: the buyer can
 * complete a payment that never reaches the merchant's page.
 *
 * The handle is taken by **name**, which is the only way to reach a window another document
 * opened. Note that this call reassigns that window's `opener` to us — which is exactly why
 * the return page posts its result with target `'*'` rather than naming an origin.
 */
export function closeGatewayWindow(): void {
  try {
    const handle = window.open('', GATEWAY_WINDOW_NAME)
    if (handle && !handle.closed) handle.close()
  } catch {
    /* cross-origin or blocked — nothing we can do */
  }
}
