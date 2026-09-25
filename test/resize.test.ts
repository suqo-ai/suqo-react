import { describe, expect, it } from 'vitest'

import { frameHeight } from '../src/resize'

describe('frameHeight', () => {
  it('passes the reported height through when the iframe has no chrome', () => {
    expect(frameHeight(412, 0, 0)).toBe(412)
  })

  it('adds back the border the host stylesheet put on the iframe', () => {
    // The frame reports content height; style.height sets the border box. A host `border`
    // with `!important` beats our inline `border: 0`, and would otherwise eat that many
    // pixels of content and leave a scrollbar inside the frame.
    expect(frameHeight(412, 420, 412)).toBe(420)
  })

  it('never subtracts, whatever the element reports', () => {
    expect(frameHeight(412, 400, 412)).toBe(412)
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('refuses a %s report rather than writing it', (_label, reported) => {
    expect(frameHeight(reported, 0, 0)).toBeNull()
  })
})
