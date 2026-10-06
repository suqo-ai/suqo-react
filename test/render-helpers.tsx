import { vi } from 'vitest'

import { MESSAGE_SOURCE } from '../src/protocol'

export const ORIGIN = 'https://pay.suqo.ai'

export const handlerSpies = () => ({
  onReady: vi.fn(),
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onUnavailable: vi.fn(),
  onLoadError: vi.fn(),
  onIntent: vi.fn(),
})

/** The rendered iframe. There is exactly one per mounted block. */
export const frame = (): HTMLIFrameElement => {
  const element = document.querySelector('iframe')
  if (element === null) throw new Error('no iframe was rendered')
  return element
}

/**
 * Delivers a message as the frame would.
 *
 * jsdom never loads the iframe, so `contentWindow` exists but hosts about:blank — which is
 * enough for the dispatcher's `event.source` match, and means every test controls its own
 * ordering rather than racing a load.
 */
export function post(
  body: Record<string, unknown>,
  options: { source?: unknown; origin?: string } = {}
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: MESSAGE_SOURCE, ...body },
      origin: options.origin ?? ORIGIN,
      source: (options.source === undefined
        ? frame().contentWindow
        : options.source) as MessageEventSource | null,
    })
  )
}

/** The gateway params a real return page would carry. */
export const PARAMS_FIXTURE = { pidx: 'k-1', MerchantTxnId: 'n-2' }

/** jsdom does not fetch iframe src, so the load event is ours to dispatch. */
export function loadFrame(): void {
  frame().dispatchEvent(new Event('load'))
}
