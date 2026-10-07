/**
 * Post-build assertions on `dist/`.
 *
 * Each of these has a failure mode that only shows up in a consumer's app, long after the
 * publish: a missing `'use client'` breaks Next.js App Router with an error that names their
 * file rather than ours; a bundled React is `Invalid hook call`; a stray CSS file quietly
 * makes `sideEffects: false` a lie and gets the whole package tree-shaken out of a build.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const problems = []

const read = (name) => {
  const path = join(dist, name)
  if (!existsSync(path)) {
    problems.push(`dist/${name} is missing`)
    return null
  }
  return readFileSync(path, 'utf8')
}

for (const name of ['index.js', 'index.cjs']) {
  const source = read(name)
  if (source === null) continue

  const firstLine = source.split('\n', 1)[0].trim()
  if (firstLine !== `'use client'` && firstLine !== `"use client"`) {
    problems.push(`dist/${name} does not start with 'use client' (got: ${firstLine.slice(0, 40)})`)
  }

  // An import of react is expected; a copy of it is not. `createElement` appearing as a
  // definition rather than a member access is the cheap tell.
  if (/function\s+createElement\s*\(/.test(source)) {
    problems.push(`dist/${name} appears to bundle React rather than import it`)
  }
}

for (const name of ['index.d.ts', 'index.d.cts']) {
  const types = read(name)
  if (types !== null && !types.includes('SUQOCheckout')) {
    problems.push(`dist/${name} does not export SUQOCheckout`)
  }
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

if (existsSync(dist)) {
  const css = walk(dist).filter((file) => file.endsWith('.css'))
  if (css.length > 0) {
    problems.push(`dist ships CSS, which contradicts "sideEffects": false: ${css.join(', ')}`)
  }
}

if (problems.length > 0) {
  console.error('check-dist failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('check-dist: dist looks publishable')
