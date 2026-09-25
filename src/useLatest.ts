import { useInsertionEffect, useRef } from 'react'

/**
 * The latest value, readable from an event handler that was never re-created.
 *
 * A merchant writing `onSuccess={(params) => …}` inline hands us a new function every render.
 * Capturing it would mean either re-running the effect — remounting the iframe and restarting
 * the payment — or firing a stale closure. Neither is acceptable, so the instance closes over
 * this ref object instead and reads `.current` at the moment a message arrives.
 *
 * `useInsertionEffect`, not `useEffect`: it runs before layout effects and before the browser
 * can deliver a `message`, so the ref is never a render behind by the time it matters. It is
 * the same mechanism React's own `useEffectEvent` is built on — and `useEffectEvent` itself is
 * still unstable, so it cannot be used in a published package.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  // Seeded rather than left undefined: the value has to be correct at mount, before any
  // effect has run at all.
  const ref = useRef(value)

  useInsertionEffect(() => {
    ref.current = value
  })

  return ref
}
