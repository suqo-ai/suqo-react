/**
 * The public type surface.
 *
 * Every name here is part of the package's contract with a merchant, so each one is either
 * something they receive in a callback or something they must be able to `switch` over.
 */

/**
 * The gateway's return parameters, exactly as it sent them.
 *
 * Never renamed, never filtered. Each gateway names its transaction id differently (`data`,
 * `pidx`, `TXNID`, `MerchantTxnId`) and a merchant reconciles against whatever their own
 * backend recorded — normalising here would throw away the only field they can match on.
 */
export type ResultParams = Record<string, string>

export type ResultStatus = 'success' | 'failed' | 'cancelled'

/**
 * The two statuses that reach `onFailure`.
 *
 * `cancelled` and `failed` must never be collapsed: a buyer who backed out wants the basket
 * offered again, a rejected payment wants looking into, and they are the only signal that
 * tells them apart.
 */
export type FailureStatus = Exclude<ResultStatus, 'success'>

/**
 * Why a session cannot be paid at all.
 *
 * Finer-grained than what the buyer is shown, on purpose: `spent` and `expired` read the same
 * to them and are opposite facts to whoever built the integration.
 */
export type UnavailableReason =
  'not-found' | 'expired' | 'spent' | 'no-customer' | 'no-methods' | 'load-failed'

/** Which of the three deadlines expired, and what the origin probe concluded. */
export interface LoadError {
  stage: 'load' | 'alive' | 'ready'
  /** Only present for `alive`, where a probe can tell the two causes apart. */
  diagnosis?: 'blocked' | 'unreachable'
  /** The sentence the buyer sees in the failure panel. */
  message: string
  /** The developer-facing hint. Also printed to the console. */
  detail: string
}
