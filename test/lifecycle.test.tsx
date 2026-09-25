import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, render } from '@testing-library/react'

import * as gateway from '../src/gateway'
import { instanceCount } from '../src/registry'
import { SUQOCheckout } from '../src/SUQOCheckout'

import { frame, handlerSpies, ORIGIN, PARAMS_FIXTURE, post } from './render-helpers'

/** Ordering and teardown — the parts that are only wrong in the gaps. */

beforeEach(() => {
  // Only what this package schedules. Faking the whole timer surface also fakes what React's
  // scheduler runs on, and re-entering it from inside `act` throws "Should not already be
  // working" — a harness failure that looks exactly like a component bug.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  cleanup()
  vi.runAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ordering at mount', () => {
  it('registers the message listener before the frame is asked to load', () => {
    // React effects run after commit, so an `src` in JSX would start loading before any
    // listener existed and `suqo:alive` could land in the gap. The fix is to defer the load,
    // not to hoist the listener — this asserts the resulting order.
    const events: string[] = []

    // Bound before spying, so the real implementation keeps its receiver.
    const realAdd = window.addEventListener.bind(window)
    const addEventListener = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type: string, ...rest: unknown[]) => {
        if (type === 'message') events.push('listener')
        realAdd(type as keyof WindowEventMap, ...(rest as [EventListenerOrEventListenerObject]))
      })

    const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      get() {
        return this.getAttribute('src') ?? ''
      },
      set(value: string) {
        events.push('src')
        this.setAttribute('src', value)
      },
    })

    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    expect(events).toEqual(['listener', 'src'])

    addEventListener.mockRestore()
    if (src) Object.defineProperty(HTMLIFrameElement.prototype, 'src', src)
  })

  it('does not fail a frame that is merely slow', () => {
    // The 20s load deadline exists because a cold origin legitimately takes seconds. The 8s
    // alive deadline must not be armed until the document has actually arrived, or every cold
    // start paints a "blocked" panel.
    const handlers = handlerSpies()
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => {
      vi.advanceTimersByTime(19_000)
    })

    expect(handlers.onLoadError).not.toHaveBeenCalled()
  })
})

describe('unmount', () => {
  it('clears every timer, so no panel appears afterwards', () => {
    const handlers = handlerSpies()
    const { unmount } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    unmount()
    act(() => {
      vi.runAllTimers()
      vi.advanceTimersByTime(60_000)
    })

    expect(handlers.onLoadError).not.toHaveBeenCalled()
  })

  it('unregisters from the page dispatcher', () => {
    const { unmount } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)
    expect(instanceCount()).toBe(1)

    unmount()
    act(() => {
      vi.runAllTimers()
    })

    expect(instanceCount()).toBe(0)
  })

  it('leaves an open gateway window alone', () => {
    // Deliberate. Closing it would interrupt a payment in flight — the buyer may be mid-OTP —
    // to protect a callback whose tree has already gone. Left open they finish, see the
    // success card, and the webhook fires: the UI signal is lost, the money signal is not.
    const close = vi.spyOn(gateway, 'closeGatewayWindow').mockImplementation(() => {})
    const { unmount } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    act(() => {
      post({ type: 'suqo:gateway' })
    })
    unmount()
    act(() => {
      vi.runAllTimers()
    })

    expect(close).not.toHaveBeenCalled()
  })
})

describe('changing the session id', () => {
  it('replaces the iframe rather than reusing the browsing context', () => {
    const { rerender } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)
    const before = frame()

    rerender(<SUQOCheckout id="cks_b" origin={ORIGIN} />)

    expect(frame()).not.toBe(before)
    expect(frame().getAttribute('src')).toContain('/c/cks_b')
  })

  it('keeps exactly one instance registered across the swap', () => {
    const { rerender } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    rerender(<SUQOCheckout id="cks_b" origin={ORIGIN} />)
    act(() => {
      vi.runAllTimers()
    })

    expect(instanceCount()).toBe(1)
  })

  it('stops delivering results to the session that was replaced', () => {
    const handlers = handlerSpies()
    const { rerender } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => {
      post({ type: 'suqo:gateway' })
    })
    rerender(<SUQOCheckout id="cks_b" origin={ORIGIN} {...handlers} />)
    act(() => {
      vi.runAllTimers()
      post({ type: 'suqo:result', status: 'success', params: PARAMS_FIXTURE }, { source: null })
    })

    // The old attempt is gone, and the new block has not opened a gateway, so nothing is
    // awaiting a result. Delivering the old one against the new session would be a payment
    // attributed to the wrong checkout.
    expect(handlers.onSuccess).not.toHaveBeenCalled()
  })
})
