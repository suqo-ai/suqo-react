// Prepends the next release's notes (from .next-notes.md, written by compute-release.mjs) to
// CHANGELOG.md, keeping the newest MAX_SECTIONS releases there and moving older ones to
// CHANGELOG_ARCHIVE.md. Ported from the suqo repo's clean-changelogs.js.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const CHANGELOG_PATH = fileURLToPath(new URL('CHANGELOG.md', root))
const ARCHIVE_PATH = fileURLToPath(new URL('CHANGELOG_ARCHIVE.md', root))
const NOTES_PATH = fileURLToPath(new URL('.next-notes.md', root))
const MAX_SECTIONS = 20
// semantic-release heads major/minor releases with '#' and patches with '##'. Match either, but not
// '### Bug Fixes' subheadings or the bare '# Changelog' title: only release headings have a version.
const SECTION_HEADING = /^#{1,2} .*\d+\.\d+\.\d+/

const splitSections = (content) => {
  const preamble = []
  const sections = []
  let current = null

  for (const line of content.split('\n')) {
    if (SECTION_HEADING.test(line)) {
      if (current) sections.push(current)
      current = [line]
    } else if (current) {
      current.push(line)
    } else {
      preamble.push(line)
    }
  }
  if (current) sections.push(current)

  return { preamble, sections }
}

const joinChangelog = (preamble, sections) => {
  const body = sections.map((section) => section.join('\n').trimEnd()).join('\n\n')
  return `${preamble.join('\n').trimEnd()}\n\n${body}\n`
}

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/clean-changelogs.mjs <version>')
  process.exit(1)
}

const notes = readFileSync(NOTES_PATH, 'utf8')
unlinkSync(NOTES_PATH)

const existing = existsSync(CHANGELOG_PATH) ? readFileSync(CHANGELOG_PATH, 'utf8') : '# Changelog\n'
const { preamble, sections } = splitSections(existing)

sections.unshift(notes.trim().split('\n'))
const overflow = sections.length > MAX_SECTIONS ? sections.splice(MAX_SECTIONS) : []

writeFileSync(CHANGELOG_PATH, joinChangelog(preamble.length ? preamble : ['# Changelog'], sections))
console.log(`clean-changelogs: wrote v${version} to CHANGELOG.md (${sections.length} kept)`)

if (overflow.length) {
  const existingArchive = existsSync(ARCHIVE_PATH)
    ? readFileSync(ARCHIVE_PATH, 'utf8')
    : '# Changelog Archive\n'
  const archive = splitSections(existingArchive)

  writeFileSync(
    ARCHIVE_PATH,
    joinChangelog(archive.preamble.length ? archive.preamble : ['# Changelog Archive'], [
      ...overflow,
      ...archive.sections,
    ])
  )
  console.log(`clean-changelogs: moved ${overflow.length} section(s) into CHANGELOG_ARCHIVE.md`)
}
