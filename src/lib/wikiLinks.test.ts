import { describe, it, expect } from 'vitest'
import { replaceWikiLink, indexOfWikiLink } from './wikiLinks'

describe('replaceWikiLink', () => {
  it('renames plain and escaped links, case-insensitively', () => {
    expect(replaceWikiLink('see [[Budget Review]] and \\[\\[budget review\\]\\]', 'Budget Review', 'FY27 Budget'))
      .toBe('see [[FY27 Budget]] and \\[\\[FY27 Budget\\]\\]')
  })

  it('leaves other links and plain mentions alone', () => {
    expect(replaceWikiLink('[[Budget Review 2]] Budget Review [[Other]]', 'Budget Review', 'X'))
      .toBe('[[Budget Review 2]] Budget Review [[Other]]')
  })

  it('handles names with regex characters', () => {
    expect(replaceWikiLink('[[Q3 (draft) + notes]]', 'Q3 (draft) + notes', 'Q3')).toBe('[[Q3]]')
  })

  it('finds a link', () => {
    expect(indexOfWikiLink('a [[Sarah Chen]] b', 'sarah chen')).toBe(2)
    expect(indexOfWikiLink('a Sarah Chen b', 'Sarah Chen')).toBe(-1)
  })
})
