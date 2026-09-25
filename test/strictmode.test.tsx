import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cleanup, render } from '@testing-library/react'

import { instanceCount } from '../src/registry'
import { SUQOCheckout } from '../src/SUQOCheckout'

import { handlerSpies, ORIGIN, post } from './render-helpers'

/**
 * StrictMode runs `setup → cleanup → setup` synchronously within one commit.
 *
 * Everything this component owns is external to React — a document load, three timers, a
 * window listener — and every one of them is non-idempotent if done twice. The mechanism that
 * saves it is the deferred, cancellable destroy: the cleanup schedules teardown on the next
 * macrotask, and the second setup cancels it. Nothing is torn down and nothing is rebuilt.
 */

let srcWrites: string[] = []
let originalSrc: PropertyDescriptor | undefined

beforeEach(() => {
  vi.useFakeTimers()
  srcWrites = []

  // Spying on the prototype catches the assignment wherever it happens, which is the point:
  // "one document load" is the invariant, not "one call to some function of ours".
  originalSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    configurable: true,
    get() {
      return this.getAttribute('src') ?? ''
    },
    set(value: string) {
      srcWrites.push(value)
      this.setAttribute('src', value)
    },
  })
})

afterEach(() => {
  cleanup()
  vi.runAllTimers()
  vi.useRealTimers()
  if (originalSrc) Object.defineProperty(HTMLIFrameElement.prototype, 'src', originalSrc)
})

describe('under StrictMode', () => {
  it('renders exactly one iframe', () => {
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} />
      </StrictMode>
    )

    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('loads the document exactly once', () => {
    // Two src writes is two page loads, two backend fetches, and — once a buyer is paying —
    // two sessions racing each other.
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} />
      </StrictMode>
    )

    expect(srcWrites).toHaveLength(1)
    expect(srcWrites[0]).toContain('/c/cks_a')
  })

  it('registers one instance, not two', () => {
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} />
      </StrictMode>
    )

    expect(instanceCount()).toBe(1)
  })

  it('arms one load deadline', () => {
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} />
      </StrictMode>
    )

    // Two 20s timers would mean two failure panels, the second landing after the first was
    // already resolved.
    expect(vi.getTimerCount()).toBe(1)
  })

  it('still delivers a single onReady', () => {
    const handlers = handlerSpies()
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />
      </StrictMode>
    )

    post({ type: 'suqo:ready' })

    expect(handlers.onReady).toHaveBeenCalledOnce()
  })

  it('survives the cleanup between the two setups', () => {
    // The specific failure this guards: a symmetric cleanup destroys the instance, the second
    // setup builds a new one, and any message arriving in between — `suqo:alive` in
    // particular — is lost, leaving the ready deadline unarmed.
    const handlers = handlerSpies()
    render(
      <StrictMode>
        <SUQOCheckout id="cks_a" origin={ORIGIN} {...handlers} />
      </StrictMode>
    )

    post({ type: 'suqo:alive' })
    post({ type: 'suqo:ready' })

    expect(handlers.onReady).toHaveBeenCalledOnce()
    expect(handlers.onLoadError).not.toHaveBeenCalled()
  })
})
