import type { ResultParams, ResultStatus, UnavailableReason } from './types'

/**
 * The wire format, and the single place untrusted data becomes a typed value.
 *
 * One funnel rather than a cast at each of the seven call sites: `parseMessage` takes
 * `unknown` and narrows once, which is what lets `no-explicit-any` stay an error everywhere
 * else in the package.
 *
 * The protocol is **one-directional**. The frame speaks; this package listens. There is no
 * outbound message type and none should be added — a checkout session carries the buyer
 * server-side, so there is nothing the host knows that the frame needs.
 */

/** Envelope tag on every message, so unrelated postMessage traffic is ignored cheaply. */
export const MESSAGE_SOURCE = 'suqo-checkout'

export type InboundMessage =
  | { type: 'suqo:alive' }
  | { type: 'suqo:ready' }
  | { type: 'suqo:resize'; height: number }
  | { type: 'suqo:gateway' }
  | { type: 'suqo:redirect'; url: string }
  | { type: 'suqo:intent'; url: string }
  | { type: 'suqo:unavailable'; reason: UnavailableReason }
  | { type: 'suqo:result'; status: ResultStatus; params: ResultParams; message?: string }

const RESULT_STATUSES: readonly string[] = ['success', 'failed', 'cancelled']

const UNAVAILABLE_REASONS: readonly string[] = [
  'not-found',
  'expired',
  'spent',
  'no-customer',
  'no-methods',
  'load-failed',
]

/**
 * Gateway params, verbatim — but only the string-valued ones.
 *
 * A non-string value is dropped rather than stringified: a merchant reconciling against
 * `"[object Object]"` is worse off than one reconciling against a missing field.
 */
function cleanParams(raw: unknown): ResultParams {
  if (!raw || typeof raw !== 'object') return {}

  const params: ResultParams = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') params[key] = value
  }
  return params
}

/** Narrows an inbound `MessageEvent.data`. Returns null for anything not ours or malformed. */
export function parseMessage(data: unknown): InboundMessage | null {
  if (!data || typeof data !== 'object') return null

  const envelope = data as Record<string, unknown>
  if (envelope['source'] !== MESSAGE_SOURCE) return null

  switch (envelope['type']) {
    case 'suqo:alive':
      return { type: 'suqo:alive' }

    case 'suqo:ready':
      return { type: 'suqo:ready' }

    case 'suqo:gateway':
      return { type: 'suqo:gateway' }

    case 'suqo:resize': {
      const height = Number(envelope['height'])
      if (!Number.isFinite(height) || height <= 0) return null
      return { type: 'suqo:resize', height }
    }

    case 'suqo:redirect': {
      const url = envelope['url']
      if (typeof url !== 'string' || url === '') return null
      return { type: 'suqo:redirect', url }
    }

    case 'suqo:intent': {
      // The frame is asking to hand a bank/wallet deeplink to the merchant, rather than
      // attempting the navigation itself — it is sandboxed and cannot move the top-level
      // page (see `intent.ts`). No origin check here: unlike `suqo:redirect`, there is
      // nothing to compare the url against, since it is never navigated to from this side.
      const url = envelope['url']
      if (typeof url !== 'string' || url === '') return null
      return { type: 'suqo:intent', url }
    }

    case 'suqo:unavailable': {
      const reason = envelope['reason']
      // An unrecognised reason is dropped rather than widened into the union. Letting an
      // arbitrary string through would make every merchant's `switch` non-exhaustive for a
      // value we do not send.
      if (typeof reason !== 'string' || !UNAVAILABLE_REASONS.includes(reason)) return null
      return { type: 'suqo:unavailable', reason: reason as UnavailableReason }
    }

    case 'suqo:result': {
      const status = envelope['status']
      if (typeof status !== 'string' || !RESULT_STATUSES.includes(status)) return null

      const message = envelope['message']
      return {
        type: 'suqo:result',
        status: status as ResultStatus,
        params: cleanParams(envelope['params']),
        // Only a real string survives. `undefined` means the backend said nothing, which the
        // merchant must be able to tell from it having said something.
        ...(typeof message === 'string' && message !== '' ? { message } : {}),
      }
    }

    default:
      return null
  }
}
