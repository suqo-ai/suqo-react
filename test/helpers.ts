import { vi } from 'vitest'

import { createHostInstance, type HostHandlers, type HostInstance } from '../src/instance'
import { MESSAGE_SOURCE } from '../src/protocol'

export const ORIGIN = 'https://pay.suqo.ai'

/**
 * Every instance a test mounted.
 *
 * `registry.ts` is a module singleton by design, so an instance left registered by one test
 * is still there routing messages in the next. `destroyMounted()` in an afterEach is what
 * keeps the suites independent.
 */
const mounted: HostInstance[] = []

export function destroyMounted(): void {
  for (const instance of mounted.splice(0)) instance.destroyNow()
  document.body.innerHTML = ''
}

export const handlerSpies = () => ({
  onReady: vi.fn(),
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onUnavailable: vi.fn(),
  onLoadError: vi.fn(),
})

/**
 * A HostInstance wired to a real (but never-loading) iframe.
 *
 * jsdom does not fetch iframe `src`, so nothing here ever produces a document — which is what
 * we want: every message is delivered by hand, so the test controls the ordering that the
 * protocol's invariants are actually about.
 */
export function mountInstance(
  id: string,
  handlers: HostHandlers = handlerSpies()
): {
  instance: HostInstance
  iframe: HTMLIFrameElement
  handlers: HostHandlers
  phases: string[]
} {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)

  const phases: string[] = []
  const instance = createHostInstance({
    key: `${ORIGIN}|${id}`,
    frameUrl: `${ORIGIN}/c/${id}#parentOrigin=https%3A%2F%2Fmerchant.example`,
    frameOrigin: ORIGIN,
    hostedUrl: `${ORIGIN}/checkout/${id}`,
    handlers: { current: handlers },
    onPhaseChange: (phase) => phases.push(phase.name),
  })

  instance.start(iframe)
  mounted.push(instance)
  return { instance, iframe, handlers, phases }
}

/** Delivers a message as the browser would, with a settable source and origin. */
export function post(
  body: Record<string, unknown>,
  options: { source?: unknown; origin?: string } = {}
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: MESSAGE_SOURCE, ...body },
      origin: options.origin ?? ORIGIN,
      source: (options.source ?? null) as MessageEventSource | null,
    })
  )
}

/** The gateway params a real return page would carry. */
export const PARAMS = { pidx: 'k-1', MerchantTxnId: 'n-2' }
