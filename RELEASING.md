# Releasing

Versions are computed by [semantic-release](https://semantic-release.gitbook.io/) from
conventional commits, land on `main` through a release PR, and are published to npm by
`.github/workflows/release.yml`. The workflow's header comment has the details.

## Commit messages decide the version

| Commit                                        | Bump                  |
| --------------------------------------------- | --------------------- |
| `fix: …`                                      | patch (0.0.1 → 0.0.2) |
| `feat: …`                                     | minor (0.0.1 → 0.1.0) |
| `feat!: …`, or a `BREAKING CHANGE:` footer    | major (0.0.1 → 1.0.0) |
| `docs:`, `chore:`, `test:`, `refactor:`, etc. | no release            |

A breaking change goes straight to 1.0.0, even while the version is below 1.0. Commits are parsed
with the [Conventional Commits](https://www.conventionalcommits.org/) preset (`.releaserc.json`).

## Every release

1. Merge PRs into `main` as usual.
2. The Release workflow opens (or updates) a `bump-release/vX.Y.Z` PR with the version bump (in
   `package.json`, the exported `VERSION` in `src/index.ts`, and `example/package-lock.json`) and
   the new `CHANGELOG.md` section.
3. That PR doesn't start CI by itself, because it was opened with `GITHUB_TOKEN`. Push an empty
   commit to it, or close and reopen it, then merge once it's green. Later merges to `main` leave
   the PR's branch alone unless the release itself changes (its version, or its notes after a new
   `feat:`/`fix:`), so your nudge isn't wiped by an unrelated merge, a dependency bump, or the next
   day's run. When it does change, nudge again.
4. The merge tags `vX.Y.Z` (on the merge commit, even if more PRs land right after), creates the
   GitHub Release and stages the package on npm.
5. Approve the staged version with 2FA: `npm stage approve <stage-id>` (the id is in the
   "Publish to npm (staged)" step log), or the "Staged Packages" tab on npmjs.com. Until then nobody can
   install it.

## If a release run fails

Use **"Re-run failed jobs"** on that run. Each job checks what already exists (the tag on the
remote, the GitHub Release, the version on npm) and only does what's missing. Don't delete the tag
to retry.

Tagging, the GitHub Release, the npm check and publish, and the release PR are separate jobs, so
one failing (an npm registry outage, a changelog heading the notes script can't find) doesn't
block the others. Only the run that created the tag may publish to npm (its run id is in the tag
message), so re-run **that** run. Re-running a later run, or pushing more commits, won't publish.

If the version is staged but not approved yet, a re-run stages it again. Approve or reject the
first one instead of re-running.

## Protect main

Turn these on for `main` in the repo's Settings → Rules (they're admin settings, not files):

- **Require a pull request before merging.** The release train assumes `main` only takes merged
  PRs. Today only the local pre-push hook enforces that, and `--no-verify` skips it.
- **Require status checks to pass** (the CI `verify` and `react19` jobs).
- **Require branches to be up to date before merging.** Without it, a `fix:` that lands on `main`
  while the release PR is open can be merged into that release before the workflow has rebuilt the
  PR: it ships, but no changelog ever lists it, because the next release starts after that tag.

## Never bump the version by hand

The release PR is the only thing that should change the version. `scripts/sync-version.mjs`
keeps `VERSION` in `src/index.ts` and the linked package's version in `example/package-lock.json`
equal to `package.json`, and `test/version.test.ts` fails CI if `VERSION` ever disagrees.

## Tool versions

`release.yml` pins npm (`NPM_VERSION`) and semantic-release (`SEMANTIC_RELEASE_PACKAGES`) on
purpose: those jobs hold a write token or the npm publish credential. Bump them deliberately.
semantic-release isn't a devDependency, because it needs Node 22 and this package supports 18.
Keep `conventional-changelog-conventionalcommits` on the major that matches the plugins'
conventional-changelog libraries (9.x for the current pins).

## One-time bootstrap: 0.0.1

npm only lets you register a trusted publisher on a package that already exists, and `@suqo`
doesn't allow tokens that bypass 2FA, so the first version is published by hand.

1. On this branch, with `package.json` at `0.0.1`, check what will ship:
   `npm pack --dry-run` should list only `dist/`, `package.json`, `README.md` and `LICENSE`.
2. `npm login` if needed, then `npm publish --access public`. `prepublishOnly` runs the full
   gate first, and npm asks for your 2FA code. 0.0.1 has no provenance, which only CI can produce.
3. On https://www.npmjs.com/package/@suqo/react/access, under "Trusted Publisher", add GitHub
   Actions with organization `suqo-ai`, repository `suqo-react`, workflow filename
   `release.yml`, and leave direct publish **unchecked** (stage-only). On the same page, set
   publishing access to require 2FA and disallow tokens, as for the other `@suqo` packages.
4. Merge the PR. The workflow tags `v0.0.1` and creates the GitHub Release, then skips the npm
   publish because 0.0.1 is already there.

The next release (0.0.2 or later) is the first to go through trusted publishing. Check its
"Publish to npm (staged)" step log says it was staged, then approve it.
