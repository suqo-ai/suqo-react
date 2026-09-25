// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { renderToStaticMarkup } from 'react-dom/server'

import { SUQOCheckout } from '../src/SUQOCheckout'

/**
 * Consumers will import this into a server-rendered tree — Next.js App Router above all — so
 * nothing may touch `window` at module scope or during render.
 *
 * There is deliberately no `typeof window` branch anywhere: the component renders identical
 * markup on the server and the client (loading phase, no `src`, a static spinner), which means
 * the whole hydration-mismatch class of bug cannot arise rather than being handled.
 */

describe('server rendering', () => {
  it('imports and renders with no window at all', () => {
    expect(typeof globalThis.window).toBe('undefined')

    const html = renderToStaticMarkup(<SUQOCheckout id="cks_a" />)

    expect(html).toContain('<iframe')
  })

  it('emits no src — the frame is only asked to load from an effect', () => {
    // The listener has to be live before the document is requested, and effects do not run on
    // the server. An `src` in the markup would start a load nobody is listening for.
    const html = renderToStaticMarkup(<SUQOCheckout id="cks_a" />)

    expect(html).not.toContain('src=')
  })

  it('carries the accessible name and the sandbox through', () => {
    const html = renderToStaticMarkup(<SUQOCheckout id="cks_a" title="Pay" />)

    expect(html).toContain('title="Pay"')
    expect(html).toContain('allow-popups-to-escape-sandbox')
  })
})
