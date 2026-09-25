import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, render } from '@testing-library/react'

import { SUQOCheckout } from '../src/SUQOCheckout'

import { frame, ORIGIN, PARAMS_FIXTURE, post } from './render-helpers'

/**
 * A merchant writing `onSuccess={(params) => …}` inline hands us a new function every render.
 *
 * Two things must both hold, and they pull against each other: the frame must not remount
 * (which would restart the payment), and the callback that fires must be the latest one
 * (which is why capturing it at mount is not an option either).
 */

afterEach(() => {
  cleanup()
})

/** A parent that re-renders on demand, passing fresh inline callbacks each time. */
function Harness({ onSuccess }: { onSuccess: (n: number) => void }) {
  const [renders, setRenders] = useState(0)

  return (
    <>
      <button onClick={() => setRenders((n) => n + 1)}>rerender</button>
      <span data-testid="renders">{renders}</span>
      <SUQOCheckout
        id="cks_a"
        origin={ORIGIN}
        onSuccess={() => onSuccess(renders)}
        onFailure={() => {}}
        onReady={() => {}}
      />
    </>
  )
}

describe('re-rendering with fresh inline callbacks', () => {
  it('does not remount the iframe', () => {
    const { getByRole } = render(<Harness onSuccess={vi.fn()} />)
    const before = frame()

    act(() => getByRole('button').click())
    act(() => getByRole('button').click())

    // Identity, not just presence: a new element is a new browsing context and a new document
    // load, which mid-payment means the buyer's session is gone.
    expect(frame()).toBe(before)
  })

  it('does not reassign src', () => {
    const { getByRole } = render(<Harness onSuccess={vi.fn()} />)
    const src = frame().getAttribute('src')

    act(() => getByRole('button').click())

    expect(frame().getAttribute('src')).toBe(src)
  })

  it('fires the callback from the most recent render, not the first', () => {
    // The whole reason the instance reads a ref instead of closing over the prop.
    const onSuccess = vi.fn()
    const { getByRole } = render(<Harness onSuccess={onSuccess} />)

    act(() => getByRole('button').click())
    act(() => getByRole('button').click())

    act(() => {
      post({ type: 'suqo:gateway' })
      post({ type: 'suqo:result', status: 'success', params: PARAMS_FIXTURE })
    })

    expect(onSuccess).toHaveBeenCalledWith(2)
  })
})
