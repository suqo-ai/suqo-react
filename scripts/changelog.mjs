// CHANGELOG.md parsing shared by clean-changelogs.mjs (writing a release's notes in) and
// release-notes.mjs (reading them back out for the GitHub Release).

// semantic-release heads major/minor releases with '#' and patches with '##'. Match either, but not
// '### Bug Fixes' subheadings or the bare '# Changelog' title: only release headings have a version.
export const SECTION_HEADING = /^#{1,2} .*\d+\.\d+\.\d+/

// A release heading for exactly `version`: '## [0.0.2](…) (date)', '# [1.0.0](…)', or '## 0.0.2'.
export const headingFor = (version) =>
  new RegExp(`^#{1,2} \\[?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?(?=[\\s(]|$)`)

export const splitSections = (content) => {
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

export const joinChangelog = (preamble, sections) => {
  const body = sections.map((section) => section.join('\n').trimEnd()).join('\n\n')
  return `${preamble.join('\n').trimEnd()}\n\n${body}\n`
}
