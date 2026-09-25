/**
 * The three deadlines, each for a distinct failure and each armed by a real signal rather
 * than by guesswork about how long the previous stage "should" take.
 *
 *   LOAD  — nothing came back at all. Disarmed by the iframe's own `load` event, which fires
 *           cross-origin (with no detail, but it fires). This must not be short: a cold
 *           serverless start legitimately takes several seconds, and an earlier version of
 *           the vanilla loader failed a 4.8s compile as "blocked".
 *   ALIVE — a document came back but never ran our script: a CSP `frame-ancestors` block, an
 *           extension, or someone else's error page at that URL. Armed only once `load` has
 *           fired, so a slow round trip can no longer trip it.
 *   READY — our script ran but the block never mounted. The frame is real and merely slow, so
 *           this is the most patient of the three.
 *
 * Pure: no DOM, no React, no `window`. That is what makes the *arming order* — the part that
 * was a bug — testable with fake timers and nothing else.
 */

export const LOAD_DEADLINE_MS = 20_000
export const ALIVE_DEADLINE_MS = 8_000
export const READY_DEADLINE_MS = 25_000

export type DeadlineName = 'load' | 'alive' | 'ready'

export interface DeadlineCallbacks {
  onLoadExpired(): void
  onAliveExpired(): void
  onReadyExpired(): void
}

export interface Deadlines {
  /** Arms LOAD. Idempotent — a second call while armed is a no-op. */
  armLoad(): void
  /** The iframe's `load` event: disarms LOAD, arms ALIVE unless `alive` already arrived. */
  frameLoaded(): void
  /** `suqo:alive`: disarms LOAD and ALIVE, arms READY. Idempotent. */
  frameAlive(): void
  clearAll(): void
  /** Which timers are outstanding. For tests, and for nothing else. */
  readonly armed: readonly DeadlineName[]
}

export function createDeadlines(callbacks: DeadlineCallbacks): Deadlines {
  const timers = new Map<DeadlineName, ReturnType<typeof setTimeout>>()
  let aliveSeen = false

  const clear = (name: DeadlineName) => {
    const timer = timers.get(name)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(name)
    }
  }

  const arm = (name: DeadlineName, ms: number, fire: () => void) => {
    // Idempotent by construction. This is defence in depth against React StrictMode running
    // the effect twice, even though the caller guards that too.
    if (timers.has(name)) return
    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name)
        fire()
      }, ms)
    )
  }

  return {
    armLoad() {
      arm('load', LOAD_DEADLINE_MS, callbacks.onLoadExpired)
    },

    frameLoaded() {
      clear('load')
      // `alive` can beat the load event — scripts run during parse — so only start waiting
      // for it if it has not already arrived.
      if (!aliveSeen) arm('alive', ALIVE_DEADLINE_MS, callbacks.onAliveExpired)
    },

    frameAlive() {
      if (aliveSeen) return
      aliveSeen = true
      // Either may still be outstanding, for the reason above.
      clear('load')
      clear('alive')
      arm('ready', READY_DEADLINE_MS, callbacks.onReadyExpired)
    },

    clearAll() {
      for (const name of [...timers.keys()]) clear(name)
    },

    get armed() {
      return [...timers.keys()]
    },
  }
}
