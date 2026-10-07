'use client'

export { SUQOCheckout } from './SUQOCheckout'
export type { SUQOCheckoutProps } from './SUQOCheckout'
export { DEFAULT_ORIGIN, LIVE_ORIGIN, SANDBOX_ORIGIN, normaliseOrigin } from './urls'
export type { CheckoutMode } from './urls'
export type {
  FailureStatus,
  LoadError,
  ResultParams,
  ResultStatus,
  UnavailableReason,
} from './types'

/**
 * This package's version, as published. The release PR keeps it equal to package.json
 * (scripts/sync-version.mjs), and test/version.test.ts fails if they disagree.
 */
export const VERSION = '0.0.1'
