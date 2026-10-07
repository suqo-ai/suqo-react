#!/usr/bin/env node
/**
 * Copies the tracked hooks in hooks/ into .git/hooks/, so every contributor gets the same pre-push
 * gate without a husky dependency for something this small.
 *
 * Runs from the "prepare" script on `npm install`. No-ops outside a plain git checkout: when this
 * package is installed as a dependency (no .git), or in a worktree (.git is a file there). Also
 * no-ops in CI, where the release workflow pushes a release branch and must not re-run the gate.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(repoRoot, 'hooks')
const gitDir = join(repoRoot, '.git')

if (
  process.env.CI ||
  !existsSync(sourceDir) ||
  !existsSync(gitDir) ||
  !statSync(gitDir).isDirectory()
) {
  process.exit(0)
}

const gitHooksDir = join(gitDir, 'hooks')
mkdirSync(gitHooksDir, { recursive: true })

for (const hook of readdirSync(sourceDir)) {
  const destination = join(gitHooksDir, hook)
  copyFileSync(join(sourceDir, hook), destination)
  chmodSync(destination, 0o755)
  console.log(`Installed git hook: ${hook}`)
}
