// Prints the CHANGELOG.md section for one version, for the GitHub Release body. Reads the changelog
// from stdin, so the release workflow can pass the tagged commit's copy rather than HEAD's:
//
//   git show <sha>:CHANGELOG.md | node scripts/release-notes.mjs <version>
//
// Exits non-zero when there's no section for that version, rather than publishing another
// release's notes under this one.
import { readFileSync } from 'node:fs'
import { headingFor, splitSections } from './changelog.mjs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version> < CHANGELOG.md')
  process.exit(1)
}

const heading = headingFor(version)
const section = splitSections(readFileSync(0, 'utf8')).sections.find(([first]) =>
  heading.test(first)
)

if (!section) {
  console.error(`release-notes: CHANGELOG.md has no section for ${version}`)
  process.exit(1)
}

process.stdout.write(`${section.join('\n').trim()}\n`)
