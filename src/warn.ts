/**
 * The only module in this package allowed to touch `console`.
 *
 * Everything is prefixed so a merchant reading their own console can tell our noise from
 * theirs, and so a support conversation can start with "search for [SuqoCheckout]".
 */
export function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[SuqoCheckout] ${message}`)
}
