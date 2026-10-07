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

A breaking change goes straight to 1.0.0, even while the version is below 1.0.

## Every release

1. Merge PRs into `main` as usual.
2. The Release workflow opens (or updates) a `bump-release/vX.Y.Z` PR with the version bump and
   the new `CHANGELOG.md` section.
3. That PR doesn't start CI by itself, because it was opened with `GITHUB_TOKEN`. Push an empty
   commit to it, or close and reopen it, then merge once it's green.
4. The merge tags `vX.Y.Z` (on the merge commit, even if more PRs land right after), creates the
   GitHub Release and stages the package on npm.
5. Approve the staged version with 2FA: `npm stage approve <stage-id>` (the id is in the
   "Publish to npm (staged)" step log), or the "Staged Packages" tab on npmjs.com. Until then nobody can
   install it.

## If a release run fails

Use **"Re-run failed jobs"** on that run. Each step checks what already exists (the tag on the
remote, the GitHub Release, the version on npm) and only does what's missing, and a re-run is
allowed to publish to npm. Don't delete the tag to retry.

If the version is staged but not approved yet, a re-run stages it again. Approve or reject the
first one instead of re-running.

## Tool versions

`release.yml` pins npm (`NPM_VERSION`) and semantic-release (`SEMANTIC_RELEASE_PACKAGES`) on
purpose: those jobs hold a write token or the npm publish credential. Bump them deliberately.
semantic-release isn't a devDependency, because it needs Node 22 and this package supports 18.

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
