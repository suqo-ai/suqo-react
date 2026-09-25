/**
 * Why nothing ran in the frame.
 *
 * From outside, a network failure and a framing block look identical — the iframe simply
 * never speaks. A `no-cors` probe of the same URL tells them apart: the request itself
 * succeeding means the origin is reachable and something stopped the *framing*, which needs
 * an entirely different fix from "the server is down".
 *
 * Those two sentences are the only thing standing between an integrator and an afternoon of
 * guessing, which is the whole reason this exists.
 */
export type Diagnosis = 'blocked' | 'unreachable'

const PROBE_TIMEOUT_MS = 3_000

/**
 * Resolves `'unreachable'` only when the fetch itself rejects.
 *
 * Everything else — no `fetch`, a timeout, an opaque response — resolves `'blocked'`. The
 * probe must never be the reason the buyer sees nothing, so it always resolves and never
 * throws.
 */
export function diagnose(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<Diagnosis> {
  if (typeof fetch !== 'function') return Promise.resolve('blocked')

  return new Promise<Diagnosis>((resolve) => {
    let settled = false
    const settle = (diagnosis: Diagnosis) => {
      if (settled) return
      settled = true
      resolve(diagnosis)
    }

    const giveUp = setTimeout(() => settle('blocked'), timeoutMs)

    fetch(url, { mode: 'no-cors', cache: 'no-store' })
      .then(() => settle('blocked'))
      .catch(() => settle('unreachable'))
      .finally(() => clearTimeout(giveUp))
  })
}
