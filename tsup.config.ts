import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'es2021',

  // `treeshake` is OFF, and that is a deviation from @suqo/react-native rather than an
  // oversight. It routes the bundle through Rollup after esbuild, and Rollup drops the
  // `banner` below — measured: with it on, dist/index.js starts with `// src/index.ts`, and
  // Next.js App Router then refuses the package with an error naming the consumer's file
  // rather than ours. esbuild already does dead-code elimination and every module here is
  // reachable from the single entry, so Rollup's pass buys close to nothing. The directive is
  // load-bearing; the treeshake is not.

  // Every peer stays external so the consumer's bundler resolves them from their own tree.
  // Two Reacts on one page is `Invalid hook call`, and bundling ours guarantees it.
  external: ['react', 'react/jsx-runtime', 'react-dom'],

  // Stamped rather than trusted to survive from source: esbuild's directive handling is
  // version-dependent. `scripts/check-dist.mjs` asserts it landed, and `splitting: false`
  // keeps the output to one chunk so there is nowhere for it to go missing.
  banner: { js: "'use client'" },

  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
})
