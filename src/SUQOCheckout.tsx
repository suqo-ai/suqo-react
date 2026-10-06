'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'

import { FailurePanel } from './FailurePanel'
import { createHostInstance, type HostInstance, type HostPhase } from './instance'
import { Spinner } from './Spinner'
import type { FailureStatus, LoadError, ResultParams, UnavailableReason } from './types'
import { frameUrl, hostedCheckoutUrl, normaliseOrigin, type CheckoutMode } from './urls'
import { useLatest } from './useLatest'

export interface SUQOCheckoutProps {
  /** The checkout session id, e.g. `cks_9f2c41a8`. Changing it starts a different payment. */
  id: string

  /** `'live'` goes to `app.suqo.ai`, `'sandbox'` to `test.suqo.ai`. Defaults to `'sandbox'`. */
  mode?: CheckoutMode | undefined

  /** Where the checkout is served from. Overrides `mode` when set. */
  origin?: string | undefined

  /** The iframe's accessible name. */
  title?: string | undefined

  className?: string | undefined
  /** Merged last, so anything this component sets on its container can be overridden. */
  style?: CSSProperties | undefined

  /** The block is on screen — payable or not. */
  onReady?: (() => void) | undefined

  /** The payment settled. Fires exactly once per attempt. */
  onSuccess?: ((params: ResultParams, message?: string) => void) | undefined

  /**
   * The payment did not settle. Exactly once per attempt.
   *
   * `cancelled` is not `failed`: a buyer who backed out wants the basket offered again, a
   * rejected payment wants looking into.
   */
  onFailure?: ((status: FailureStatus, params: ResultParams, message?: string) => void) | undefined

  /**
   * The session cannot be paid at all — expired, spent, misconfigured.
   *
   * Not a payment outcome, so `onFailure` does not also fire: no attempt was made.
   */
  onUnavailable?: ((reason: UnavailableReason) => void) | undefined

  /** A load deadline expired. The failure panel renders regardless; this is for telemetry. */
  onLoadError?: ((error: LoadError) => void) | undefined

  /**
   * The frame wants a bank/wallet deeplink (`intent://…`, `fonepayApp://…`) handed off to a
   * native app, rather than attempting the navigation itself — it is sandboxed and cannot
   * move your top-level page. This component never navigates on it; what you do —
   * typically `location.href = url` — is entirely your own code's call.
   *
   * `javascript:`/`data:`/`file:`/`blob:` are refused before they would ever reach this
   * handler. Not a payment outcome, so `onFailure` does not also fire.
   */
  onIntent?: ((url: string) => void) | undefined
}

/**
 * The iframe's initial styles.
 *
 * A module constant to avoid re-allocating on every render — **not** because the object's
 * identity is load-bearing. After the first `suqo:resize` the height is written imperatively,
 * and it survives subsequent renders because React diffs `style` key by *value*: `height` is
 * `'320px'` in both the previous and next objects, so it is never part of the diff and never
 * re-applied. Measured, because the opposite is the reasonable guess. `test/frame.test.tsx`
 * pins the behaviour rather than the mechanism, so it holds either way.
 */
const FRAME_STYLE: CSSProperties = Object.freeze({
  display: 'block',
  width: '100%',
  height: '320px',
  border: 0,
  overflow: 'hidden',
  backgroundColor: 'transparent',
  colorScheme: 'normal',
  transition: 'height 180ms ease',
  boxSizing: 'border-box',
})

const MIN_FRAME_HEIGHT = 320

/**
 * The SUQO payment block, rendered inline where you put it.
 *
 * This component is the **host** half of the embed protocol. The buyer's Pay button lives
 * inside the iframe, on SUQO's origin — so this never opens the gateway window, never touches
 * a payment API, and never sees a card number. What it does is mount the frame, keep it the
 * right height, and deliver exactly one outcome per attempt.
 *
 * `onSuccess` is a signal to navigate, not proof of fulfilment. Fulfil from the webhook: on
 * some surfaces — an in-app browser with no popup, or a buyer who navigates away mid-payment —
 * no callback can fire at all, and the session's `return_url` plus the webhook is the only
 * path that always works.
 */
export function SUQOCheckout({
  id,
  mode,
  origin,
  title = 'SUQO — Secure payment',
  className,
  style,
  onReady,
  onSuccess,
  onFailure,
  onUnavailable,
  onLoadError,
  onIntent,
}: SUQOCheckoutProps): ReactElement {
  const resolvedOrigin = useMemo(() => normaliseOrigin(origin, mode), [origin, mode])
  const instanceKey = `${resolvedOrigin}|${id}`

  // The ref object is stable; the functions inside it are not. That is what lets a merchant
  // write inline arrow functions without remounting the frame on every render.
  const handlers = useLatest({
    onReady,
    onSuccess,
    onFailure,
    onUnavailable,
    onLoadError,
    onIntent,
  })

  const [phase, setPhase] = useState<HostPhase>({ name: 'loading' })
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const instanceRef = useRef<HostInstance | null>(null)

  useEffect(() => {
    const frame = iframeRef.current
    if (frame === null) return

    const previous = instanceRef.current
    if (previous !== null && previous.key !== instanceKey) {
      // A different session. Tear the old one down synchronously, before the new one exists,
      // rather than letting the deferred destroy race it.
      previous.destroyNow()
      setPhase({ name: 'loading' })
    }

    if (previous === null || previous.key !== instanceKey) {
      instanceRef.current = createHostInstance({
        key: instanceKey,
        frameUrl: frameUrl(resolvedOrigin, id, window.location.origin),
        frameOrigin: resolvedOrigin,
        hostedUrl: hostedCheckoutUrl(resolvedOrigin, id),
        handlers,
        onPhaseChange: setPhase,
      })
    }

    const instance = instanceRef.current
    if (instance === null) return

    // Idempotent: cancels a pending destroy, registers once, arms LOAD once, assigns src once.
    // Under StrictMode this runs twice and the second pass is entirely a no-op.
    instance.start(frame)

    // Deferred, so the cleanup StrictMode runs between two setups cancels itself. A
    // synchronous teardown here would drop any `suqo:alive` landing in the gap, leaving the
    // ready deadline unarmed and painting a failure panel over a working block 20s later.
    return () => instance.scheduleDestroy()
  }, [instanceKey, id, resolvedOrigin, handlers])

  return (
    <div
      className={className}
      data-suqo-react-checkout=""
      style={{
        position: 'relative',
        ...(phase.name === 'loading' ? { minHeight: MIN_FRAME_HEIGHT } : null),
        ...style,
      }}
      {...(phase.name === 'loading' ? { 'aria-busy': true } : {})}
    >
      {phase.name === 'loading' ? <Spinner /> : null}

      {/* No `src` here. It is assigned in the effect, after the message listener is live —
          otherwise the frame can report itself alive before anything is listening, and the
          handshake is lost. `key` forces a fresh browsing context when the session changes. */}
      <iframe
        key={instanceKey}
        ref={iframeRef}
        title={title}
        allow="payment 'src'"
        // The gateway never loads in this frame — it always opens in a separate window — and
        // `allow-popups-to-escape-sandbox` leaves that window unsandboxed so the banks'
        // custom-protocol deeplinks still work. `allow-forms` is required: the form-post
        // gateways submit a real <form> into it.
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        scrolling="no"
        style={FRAME_STYLE}
        onLoad={() => instanceRef.current?.frameLoaded()}
      />

      {phase.name === 'failed' ? (
        <FailurePanel message={phase.message} href={hostedCheckoutUrl(resolvedOrigin, id)} />
      ) : null}
    </div>
  )
}
