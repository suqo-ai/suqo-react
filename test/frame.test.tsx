import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, render } from '@testing-library/react'

import * as navigate from '../src/navigate'
import { SUQOCheckout } from '../src/SUQOCheckout'

import { frame, handlerSpies, ORIGIN, post } from './render-helpers'

/** What the frame's messages actually do to the DOM and to the merchant's callbacks. */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('resize', () => {
  it('writes the reported height, plus whatever border the host put on the iframe', () => {
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)
    // jsdom reports 0 for both, so the chrome has to be stubbed to exercise the arithmetic.
    Object.defineProperty(frame(), 'offsetHeight', { configurable: true, value: 420 })
    Object.defineProperty(frame(), 'clientHeight', { configurable: true, value: 412 })

    act(() => post({ type: 'suqo:resize', height: 412 }))

    expect(frame().style.height).toBe('420px')
  })

  it('survives a re-render caused by something else entirely', () => {
    // The height is written imperatively; React re-applies a style key only when the style
    // object disagrees. A module-level frozen FRAME_STYLE is what keeps the object identical
    // every render — inline the literal and every parent re-render snaps the frame to 320px.
    function Harness() {
      const [n, setN] = useState(0)
      return (
        <>
          <button onClick={() => setN(n + 1)}>rerender</button>
          <SUQOCheckout id="cks_a" origin={ORIGIN} />
        </>
      )
    }

    const { getByRole } = render(<Harness />)
    act(() => post({ type: 'suqo:resize', height: 500 }))
    expect(frame().style.height).toBe('500px')

    act(() => getByRole('button').click())

    expect(frame().style.height).toBe('500px')
  })
})

describe('ready', () => {
  it('drops the spinner and fires onReady once', () => {
    const handlers = handlerSpies()
    const { container } = render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()

    act(() => post({ type: 'suqo:ready' }))
    act(() => post({ type: 'suqo:ready' }))

    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(handlers.onReady).toHaveBeenCalledOnce()
  })
})

describe('unavailable', () => {
  it('reports the reason and leaves the payment callbacks alone', () => {
    const handlers = handlerSpies()
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => post({ type: 'suqo:unavailable', reason: 'expired' }))

    expect(handlers.onUnavailable).toHaveBeenCalledWith('expired')
    expect(handlers.onFailure).not.toHaveBeenCalled()
  })
})

describe('intent', () => {
  it('hands the url to onIntent verbatim and touches nothing else', () => {
    const go = vi.spyOn(navigate, 'navigateTopLevel').mockImplementation(() => {})
    const handlers = handlerSpies()
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => post({ type: 'suqo:intent', url: 'intent://payment/x' }))

    expect(handlers.onIntent).toHaveBeenCalledWith('intent://payment/x')
    expect(handlers.onFailure).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
    // Unlike suqo:redirect, this package never navigates on it itself.
    expect(go).not.toHaveBeenCalled()
  })

  it('does not reach onIntent when the scheme is refused', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handlers = handlerSpies()
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => post({ type: 'suqo:intent', url: 'javascript:alert(1)' }))

    expect(handlers.onIntent).not.toHaveBeenCalled()
  })

  it('warns instead of failing silently when no onIntent is configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    act(() => post({ type: 'suqo:intent', url: 'intent://payment/x' }))

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('intent://payment/x'))
  })
})

describe('redirect', () => {
  it('navigates the top-level page to a same-origin url', () => {
    const go = vi.spyOn(navigate, 'navigateTopLevel').mockImplementation(() => {})
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    act(() => post({ type: 'suqo:redirect', url: `${ORIGIN}/checkout/cks_a` }))

    expect(go).toHaveBeenCalledWith(`${ORIGIN}/checkout/cks_a`)
  })

  it('fires no merchant callback — nothing settled', () => {
    // The document is about to be destroyed. onFailure would report a failure that did not
    // happen, and there is no success to report either.
    const handlers = handlerSpies()
    vi.spyOn(navigate, 'navigateTopLevel').mockImplementation(() => {})
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />)

    act(() => post({ type: 'suqo:redirect', url: `${ORIGIN}/checkout/cks_a` }))

    expect(handlers.onFailure).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin url and stays put', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const go = vi.spyOn(navigate, 'navigateTopLevel').mockImplementation(() => {})
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    act(() => post({ type: 'suqo:redirect', url: 'https://evil.example/steal' }))

    expect(go).not.toHaveBeenCalled()
  })

  it('navigates once however many times it is asked', () => {
    const go = vi.spyOn(navigate, 'navigateTopLevel').mockImplementation(() => {})
    render(<SUQOCheckout id="cks_a" origin={ORIGIN} />)

    act(() => {
      post({ type: 'suqo:redirect', url: `${ORIGIN}/checkout/cks_a` })
      post({ type: 'suqo:redirect', url: `${ORIGIN}/checkout/cks_a` })
    })

    expect(go).toHaveBeenCalledOnce()
  })
})
