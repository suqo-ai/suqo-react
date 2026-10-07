#!/usr/bin/env node
/**
 * Copies the tracked hooks in hooks/ into .git/hooks/, so every contributor gets the same pre-push
 * gate without a husky dependency for something this small.
 *
 * Runs from the "prepare" script on `npm install`. No-ops outside a plain git checkout: when this
 * package is installed as a dependency (no .git), or in a worktree (.git is a file there). Also
 * no-ops in CI, where the release workflow pushes a release branch and must not re-run the gate.
 *
 * Never replaces a hook it didn't install (git-lfs, a secret scanner, ...), and stays out of the
 * way when core.hooksPath points git somewhere else. It warns instead, so `npm install` still works.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(repoRoot, 'hooks')
const gitDir = join(repoRoot, '.git')
// Every hook in hooks/ names this script in its header; that's how an installed copy is recognised.
const MARKER = 'scripts/install-git-hooks.mjs'

if (
  process.env.CI ||
  !existsSync(sourceDir) ||
  !existsSync(gitDir) ||
  !statSync(gitDir).isDirectory()
) {
  process.exit(0)
}

const hooksPath = (() => {
  try {
    return execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: repoRoot })
      .toString()
      .trim()
  } catch {
    return '' // unset (git exits 1), or no git on PATH
  }
})()
if (hooksPath) {
  console.warn(
    `install-git-hooks: core.hooksPath is set (${hooksPath}), so .git/hooks is ignored. ` +
      `Not installing; call hooks/pre-push from your own pre-push hook to get the gate.`
  )
  process.exit(0)
}

const gitHooksDir = join(gitDir, 'hooks')
mkdirSync(gitHooksDir, { recursive: true })

for (const hook of readdirSync(sourceDir)) {
  const destination = join(gitHooksDir, hook)
  if (existsSync(destination) && !readFileSync(destination, 'utf8').includes(MARKER)) {
    console.warn(
      `install-git-hooks: .git/hooks/${hook} already exists and wasn't installed by this script. ` +
        `Leaving it alone; call hooks/${hook} from it to get the gate.`
    )
    continue
  }
  copyFileSync(join(sourceDir, hook), destination)
  chmodSync(destination, 0o755)
  console.log(`Installed git hook: ${hook}`)
}
