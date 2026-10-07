// Copies package.json's version to the two other places that record it:
//  - src/index.ts's exported VERSION (test/version.test.ts fails if they ever disagree)
//  - example/package-lock.json, which records the linked parent package ('..') and its version
// The release workflow runs it right after `npm version`, so the release PR bumps all three.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

const indexPath = fileURLToPath(new URL('src/index.ts', root))
const source = readFileSync(indexPath, 'utf8')
const pattern = /^export const VERSION = '[^']*'(?=\r?$)/m
if (!pattern.test(source)) {
  console.error(`sync-version: no "export const VERSION = '…'" line in src/index.ts`)
  process.exit(1)
}
writeFileSync(indexPath, source.replace(pattern, `export const VERSION = '${version}'`))
console.log(`sync-version: src/index.ts VERSION = ${version}`)

const exampleLockPath = fileURLToPath(new URL('example/package-lock.json', root))
if (existsSync(exampleLockPath)) {
  const lock = JSON.parse(readFileSync(exampleLockPath, 'utf8'))
  const parent = lock.packages?.['..']
  if (!parent) {
    console.error(`sync-version: example/package-lock.json has no '..' entry for this package`)
    process.exit(1)
  }
  parent.version = version
  // npm's own formatting, so the diff is just the version line.
  writeFileSync(exampleLockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`sync-version: example/package-lock.json '..' = ${version}`)
}
