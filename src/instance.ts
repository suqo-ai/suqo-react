import { createDeadlines, READY_DEADLINE_MS, type Deadlines } from './deadlines'
import { diagnose } from './diagnose'
import { closeGatewayWindow } from './gateway'
import { validateIntentUrl } from './intent'
import { navigateTopLevel, validateRedirectUrl } from './navigate'
import type { InboundMessage } from './protocol'
import { register, unregister } from './registry'
import { frameHeight } from './resize'
import type { FailureStatus, LoadError, ResultParams, UnavailableReason } from './types'
import { warn } from './warn'

/**
 * One mounted block's protocol state.
 *
 * This is the vanilla loader's per-container "session" record with the DOM bookkeeping taken
 * out — React owns the element. What is left is the part that was hard: which deadlines are
 * live, whether a gateway window is open, and whether this attempt's result has already been
 * delivered.
 *
 * It is a plain object rather than React state on purpose. Every field here is read from a
 * `message` handler, and a value that is one render stale would mean delivering a payment
 * result twice.
 */

export interface HostHandlers {
  onReady?: (() => void) | undefined
  onSuccess?: ((params: ResultParams, message?: string) => void) | undefined
  onFailure?: ((status: FailureStatus, params: ResultParams, message?: string) => void) | undefined
  onUnavailable?: ((reason: UnavailableReason) => void) | undefined
  onLoadError?: ((error: LoadError) => void) | undefined
  /**
   * A bank/wallet deeplink the frame wants handed off, rather than navigating to itself —
   * it is sandboxed and cannot move the top-level page. This package never navigates on it;
   * what happens next is the merchant's own code's call.
   */
  onIntent?: ((url: string) => void) | undefined
}

export type HostPhase =
  | { name: 'loading' }
  | { name: 'ready' }
  | { name: 'failed'; message: string }
  | { name: 'redirecting' }

export interface HostInstanceOptions {
  /** `${origin}|${id}`. A change to this is a genuine remount, not a re-render. */
  readonly key: string
  readonly frameUrl: string
  readonly frameOrigin: string
  /** Where the failure panel's escape hatch points. */
  readonly hostedUrl: string
  /**
   * Read at fire time, never captured.
   *
   * This is what makes `onSuccess={() => …}` written inline safe: the prop changes every
   * render, the ref object does not, so the effect never re-runs and the frame never
   * remounts — yet the callback that fires is the latest one.
   */
  readonly handlers: { readonly current: HostHandlers }
  /** Drives React state. Must be stable — it is `setPhase`. */
  readonly onPhaseChange: (phase: HostPhase) => void
}

export interface HostInstance {
  readonly key: string
  readonly origin: string
  start(iframe: HTMLIFrameElement): void
  frameLoaded(): void
  scheduleDestroy(): void
  destroyNow(): void
  handle(message: InboundMessage): void
  ownsFrame(source: MessageEventSource | null): boolean
  readonly gatewayOpened: boolean
  readonly awaitingResult: boolean
}

/** The buyer-facing sentence per deadline. Carried over from the loader unchanged. */
const FAILURE_COPY: Record<LoadError['stage'], string> = {
  load: 'We could not reach the payment form. Please check your connection and try again.',
  alive: 'The payment form could not be displayed here. You can continue in a new tab.',
  ready: 'The payment form is taking longer than expected. You can continue in a new tab.',
}

export function createHostInstance(options: HostInstanceOptions): HostInstance {
  let iframe: HTMLIFrameElement | null = null
  let deadlines: Deadlines | null = null
  let destroyTimer: ReturnType<typeof setTimeout> | null = null

  let registered = false
  let srcAssigned = false
  let alive = false
  let ready = false
  let failed = false
  let gatewayOpened = false
  let resultHandled = false
  let redirecting = false
  let destroyed = false

  const fail = (
    stage: LoadError['stage'],
    detail: string,
    diagnosis?: 'blocked' | 'unreachable'
  ) => {
    if (destroyed || failed || ready) return
    failed = true
    deadlines?.clearAll()

    const message = FAILURE_COPY[stage]
    options.onPhaseChange({ name: 'failed', message })
    warn(detail)
    options.handlers.current.onLoadError?.({
      stage,
      message,
      detail,
      ...(diagnosis ? { diagnosis } : {}),
    })
  }

  const instance: HostInstance = {
    key: options.key,
    origin: options.frameOrigin,

    get gatewayOpened() {
      return gatewayOpened
    },

    get awaitingResult() {
      return gatewayOpened && !resultHandled
    },

    ownsFrame(source) {
      // Guarded: an instance mid-teardown has no iframe, and an unguarded read here would
      // throw for every other block on the page.
      return !!iframe && iframe.contentWindow === source
    },

    start(element) {
      if (destroyed) return

      // A pending teardown means React StrictMode just ran cleanup between two setups, or a
      // parent re-rendered us out and straight back in. Either way we are still wanted.
      if (destroyTimer !== null) {
        clearTimeout(destroyTimer)
        destroyTimer = null
      }

      iframe = element

      if (!registered) {
        register(instance)
        registered = true
      }

      deadlines ??= createDeadlines({
        onLoadExpired: () =>
          fail(
            'load',
            `nothing came back from ${options.frameUrl} in time — check the checkout origin is ` +
              'reachable, and in development that the dev server is running on it'
          ),
        onAliveExpired: () => {
          // A network failure and a framing block look identical from out here, and need
          // opposite fixes. The probe is what tells them apart.
          void diagnose(options.frameUrl).then((diagnosis) =>
            fail(
              'alive',
              diagnosis === 'unreachable'
                ? `${options.frameOrigin} could not be reached at all`
                : `a document loaded from ${options.frameUrl} but never ran the checkout — a CSP ` +
                    'frame-ancestors block, a browser extension, or another page at that URL',
              diagnosis
            )
          )
        },
        onReadyExpired: () =>
          fail(
            'ready',
            `the checkout loaded but never became ready within ${READY_DEADLINE_MS / 1000}s — the ` +
              'page is reachable, so this is slowness rather than a framing block'
          ),
      })

      deadlines.armLoad()

      // Last, and only once. Assigning `src` is the only moment a request is issued, and by
      // now the dispatcher's listener is live — so there is no window in which the frame can
      // speak before anything can hear it.
      if (!srcAssigned) {
        srcAssigned = true
        element.src = options.frameUrl
      }
    },

    frameLoaded() {
      // An iframe with no `src` still fires `load` for its initial about:blank document.
      // Unguarded, that disarms LOAD and arms the 8s ALIVE deadline before the real document
      // has even been requested — a false "blocked" panel on every mount.
      if (!srcAssigned || destroyed) return
      deadlines?.frameLoaded()
    },

    scheduleDestroy() {
      if (destroyed || destroyTimer !== null) return
      // Deferred so a StrictMode remount can cancel it. Tearing down synchronously and
      // rebuilding loses any `suqo:alive` that lands in the gap, which leaves READY unarmed
      // and paints a failure panel over a working block 20 seconds later.
      destroyTimer = setTimeout(() => {
        destroyTimer = null
        instance.destroyNow()
      }, 0)
    },

    destroyNow() {
      if (destroyed) return
      destroyed = true

      if (destroyTimer !== null) {
        clearTimeout(destroyTimer)
        destroyTimer = null
      }

      deadlines?.clearAll()
      if (registered) {
        unregister(instance)
        registered = false
      }
      iframe = null

      // The gateway window is deliberately left open. Closing it would interrupt a payment
      // in flight — the buyer may be mid-OTP — to protect a callback whose tree has already
      // gone. Left alone they finish, see the success card, and the webhook fires: the UI
      // signal is lost, the money signal is not.
    },

    handle(message) {
      if (destroyed) return

      switch (message.type) {
        case 'suqo:alive': {
          if (alive) return
          alive = true
          deadlines?.frameAlive()
          return
        }

        case 'suqo:ready': {
          if (ready) return
          ready = true
          deadlines?.clearAll()
          options.onPhaseChange({ name: 'ready' })
          options.handlers.current.onReady?.()
          return
        }

        case 'suqo:resize': {
          if (!iframe) return
          const height = frameHeight(message.height, iframe.offsetHeight, iframe.clientHeight)
          // Imperative, never state: the frame's ResizeObserver fires on every content change,
          // and a setState per tick would re-render the merchant's subtree for a CSS pixel.
          if (height !== null) iframe.style.height = `${height}px`
          return
        }

        case 'suqo:gateway': {
          gatewayOpened = true
          // A fresh attempt: whatever the previous one resolved to is spent, so the next
          // result is a new one and must be delivered.
          resultHandled = false
          return
        }

        case 'suqo:redirect': {
          if (redirecting) return
          const href = validateRedirectUrl(message.url, options.frameOrigin)
          if (href === null) return

          redirecting = true
          // Necessary, not tidiness: the READY deadline can otherwise fire during the unload
          // window and paint a failure panel over a page that is already leaving.
          deadlines?.clearAll()
          closeGatewayWindow()
          options.onPhaseChange({ name: 'redirecting' })
          // No callback fires here. The merchant's document is about to be destroyed, and
          // `onFailure` would report a failure that did not happen.
          navigateTopLevel(href)
          return
        }

        case 'suqo:intent': {
          const url = validateIntentUrl(message.url)
          if (url === null) return

          const onIntent = options.handlers.current.onIntent
          if (onIntent) {
            onIntent(url)
          } else {
            warn(
              `the checkout wants to hand off to ${url}, but no onIntent was configured — ` +
                'pass one to let the buyer reach their bank app.'
            )
          }
          return
        }

        case 'suqo:unavailable': {
          // Not a payment outcome. Firing onFailure would tell the merchant an attempt was
          // made and rejected, when none was attempted at all.
          options.handlers.current.onUnavailable?.(message.reason)
          return
        }

        case 'suqo:result': {
          // The result travels more than one path on purpose — a same-origin channel from the
          // return page, plus a post to the opener and the opener's parent — because any one
          // of them can be severed. Arriving twice is expected; delivering twice is how a
          // merchant fulfils an order two times.
          if (resultHandled) return
          gatewayOpened = false
          resultHandled = true

          const handlers = options.handlers.current
          if (message.status === 'success') {
            handlers.onSuccess?.(message.params, message.message)
          } else {
            handlers.onFailure?.(message.status, message.params, message.message)
          }
          return
        }
      }
    },
  }

  return instance
}
