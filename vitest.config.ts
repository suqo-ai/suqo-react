import { defineConfig } from 'vitest/config'

/**
 * jsdom, because this package is a DOM host: an iframe, a `message` listener and a
 * `window.location` write are the whole of what it does.
 *
 * Three jsdom facts shape nearly every test here, and each has a seam built for it in `src/`:
 *
 *   1. jsdom does not fetch iframe `src`. No document ever loads, so the `load` event is
 *      dispatched by hand in the tests that need it.
 *   2. `offsetHeight` and `clientHeight` are always 0. The host's border-chrome arithmetic
 *      (PROTOCOL §5.4) is therefore only meaningful as a pure function — hence `src/resize.ts`.
 *   3. Assigning `window.location` throws "Not implemented: navigation". `src/navigate.ts`
 *      exists so the one write in this package can be mocked.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    coverage: { include: ['src/**'] },
  },
})
