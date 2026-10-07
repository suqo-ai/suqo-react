import { describe, expect, it } from 'vitest'

import pkg from '../package.json'
import { VERSION } from '../src'

describe('VERSION', () => {
  it('matches package.json', () => {
    // The release PR bumps package.json and runs scripts/sync-version.mjs to bump this with it.
    // If they disagree, something bumped one by hand.
    expect(VERSION).toBe(pkg.version)
  })
})
