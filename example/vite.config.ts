import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Two Reacts is `Invalid hook call`.
 *
 * `file:..` symlinks the package, whose own node_modules holds react and react-dom as
 * devDependencies — needed there for typecheck and tests. Vite resolves outwards from the
 * importing file and finds those copies first, so without the aliases below this app ends up
 * with two of each and every hook throws.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      // dedupe covers bare specifiers; the aliases also cover deep ones like
      // react/jsx-runtime and react-dom/client, which resolve through the package's own tree.
      react: resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': resolve(import.meta.dirname, 'node_modules/react-dom'),
      // Iterate against source by default. `npm run dev:dist` exercises the built package
      // instead — the exports map and the 'use client' banner — before a release rather than
      // after one.
      ...(process.env['EXAMPLE_DIST']
        ? {}
        : { 'react-suqo-checkout': resolve(import.meta.dirname, '../src/index.ts') }),
    },
  },
  // esbuild pre-bundling a symlinked source dependency caches a stale copy, and edits then
  // appear not to apply.
  optimizeDeps: { exclude: ['react-suqo-checkout'] },
  server: { fs: { allow: ['..'] }, port: 4600 },
})
