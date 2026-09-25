import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ALIVE_DEADLINE_MS,
  createDeadlines,
  LOAD_DEADLINE_MS,
  READY_DEADLINE_MS,
} from '../src/deadlines'

/**
 * The arming *order* is the thing under test, not the durations.
 *
 * Each deadline waits for a different failure, and each is armed by a real signal rather than
 * by a guess about how long the previous stage should take. Getting the order wrong is how an
 * earlier version of the vanilla loader failed a 4.8s cold compile as "blocked".
 */

const callbacks = () => ({
  onLoadExpired: vi.fn(),
  onAliveExpired: vi.fn(),
  onReadyExpired: vi.fn(),
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('load', () => {
  it('is armed by arming, and fires at exactly its deadline', () => {
    const fns = callbacks()
    createDeadlines(fns).armLoad()

    vi.advanceTimersByTime(LOAD_DEADLINE_MS - 1)
    expect(fns.onLoadExpired).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fns.onLoadExpired).toHaveBeenCalledOnce()
  })

  it('arms one timer however many times it is asked', () => {
    // React StrictMode runs the effect twice. The caller guards that too; this is the second
    // line of defence, and the cheaper one to reason about.
    const fns = callbacks()
    const deadlines = createDeadlines(fns)

    deadlines.armLoad()
    deadlines.armLoad()
    deadlines.armLoad()

    expect(deadlines.armed).toEqual(['load'])
    vi.advanceTimersByTime(LOAD_DEADLINE_MS)
    expect(fns.onLoadExpired).toHaveBeenCalledOnce()
  })
})

describe('alive', () => {
  it('is not armed until the frame has loaded', () => {
    // The load deadline is 20s precisely because a slow round trip is legitimate. Arming the
    // 8s alive timer at mount would fail every cold start.
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()

    vi.advanceTimersByTime(19_000)

    expect(deadlines.armed).toEqual(['load'])
    expect(fns.onAliveExpired).not.toHaveBeenCalled()
  })

  it('is armed by the frame’s load event, which also disarms load', () => {
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()

    deadlines.frameLoaded()
    expect(deadlines.armed).toEqual(['alive'])

    vi.advanceTimersByTime(ALIVE_DEADLINE_MS)
    expect(fns.onAliveExpired).toHaveBeenCalledOnce()
    expect(fns.onLoadExpired).not.toHaveBeenCalled()
  })
})

describe('alive arriving before the load event', () => {
  it('disarms both and arms ready — scripts run during parse', () => {
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()

    deadlines.frameAlive()

    expect(deadlines.armed).toEqual(['ready'])
    vi.advanceTimersByTime(LOAD_DEADLINE_MS + ALIVE_DEADLINE_MS)
    expect(fns.onLoadExpired).not.toHaveBeenCalled()
    expect(fns.onAliveExpired).not.toHaveBeenCalled()
  })

  it('does not arm alive when the load event arrives afterwards', () => {
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()
    deadlines.frameAlive()

    deadlines.frameLoaded()

    expect(deadlines.armed).toEqual(['ready'])
  })
})

describe('ready', () => {
  it('is armed only by alive, and is the most patient of the three', () => {
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()
    deadlines.frameLoaded()
    expect(deadlines.armed).toEqual(['alive'])

    deadlines.frameAlive()
    vi.advanceTimersByTime(READY_DEADLINE_MS - 1)
    expect(fns.onReadyExpired).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fns.onReadyExpired).toHaveBeenCalledOnce()
  })
})

describe('clearAll', () => {
  it('leaves nothing to fire', () => {
    const fns = callbacks()
    const deadlines = createDeadlines(fns)
    deadlines.armLoad()
    deadlines.frameAlive()

    deadlines.clearAll()

    expect(deadlines.armed).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(fns.onLoadExpired).not.toHaveBeenCalled()
    expect(fns.onAliveExpired).not.toHaveBeenCalled()
    expect(fns.onReadyExpired).not.toHaveBeenCalled()
  })
})
