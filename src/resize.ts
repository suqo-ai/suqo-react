/**
 * The height to write on the iframe, or null when the report is unusable.
 *
 * The frame reports the height of its *content*, but `style.height` sets the border box. A
 * host stylesheet can put a border on the iframe — and with `!important` it beats the inline
 * `border: 0` we set — which would then eat that much content and leave a scrollbar inside.
 * So whatever chrome the element actually has is added back.
 *
 * Extracted as a pure function because jsdom reports `offsetHeight === clientHeight === 0`
 * for everything, which makes this arithmetic untestable through the DOM — and it was a bug
 * once already.
 */
export function frameHeight(
  reported: number,
  offsetHeight: number,
  clientHeight: number
): number | null {
  if (!Number.isFinite(reported) || reported <= 0) return null

  const chrome = offsetHeight - clientHeight
  return reported + (chrome > 0 ? chrome : 0)
}
