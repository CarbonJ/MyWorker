import { describe, it, expect } from 'vitest'
import { replaceWikiLink, indexOfWikiLink, findWikiEntity, findWikiLinks, unlinkWikiLink } from './wikiLinks'

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

describe('wikiLinkKey / findWikiEntity', () => {
  const entities = [
    { name: 'Analysis | Real Time Alerting - Phone and Email Changes via UCP' },
    { name: 'Q3_plan *draft*' },
    { name: 'R&D <core>' },
  ]

  it('matches names with pipes and dashes exactly as typed', () => {
    expect(findWikiEntity(entities, 'Analysis | Real Time Alerting - Phone and Email Changes via UCP')).toBe(entities[0])
  })

  it('ignores case, extra spaces and non-breaking spaces', () => {
    expect(findWikiEntity(entities, ' analysis |  real time alerting - phone and email changes via ucp ')).toBe(entities[0])
  })

  it('ignores smart punctuation the editor may substitute', () => {
    expect(findWikiEntity(entities, 'Analysis | Real Time Alerting – Phone and Email Changes via UCP')).toBe(entities[0])
  })

  it('ignores markdown escapes and HTML entities from the serializer', () => {
    expect(findWikiEntity(entities, 'Q3\\_plan \\*draft\\*')).toBe(entities[1])
    expect(findWikiEntity(entities, 'R&amp;D &lt;core&gt;')).toBe(entities[2])
  })

  it('finds nothing for an unknown or empty name', () => {
    expect(findWikiEntity(entities, 'Analysis')).toBeUndefined()
    expect(findWikiEntity(entities, '  ')).toBeUndefined()
  })
})

describe('findWikiLinks', () => {
  it('finds plain and escaped links with their offsets', () => {
    const text = 'a [[One]] b \\[\\[Two | x\\]\\] c'
    expect(findWikiLinks(text).map(l => [l.name, text.slice(l.index, l.index + l.length)])).toEqual([
      ['One', '[[One]]'],
      ['Two | x', '\\[\\[Two | x\\]\\]'],
    ])
  })

  it('renames links whose stored text differs only by escapes or spacing', () => {
    expect(replaceWikiLink('see [[Q3\\_plan  \\*draft\\*]]', 'Q3_plan *draft*', 'Q4 plan')).toBe('see [[Q4 plan]]')
  })
})

describe('unlinkWikiLink', () => {
  it('leaves the words, drops the brackets, plain and escaped', () => {
    expect(unlinkWikiLink('a [[Old Note]] b \\[\\[old note\\]\\] [[Other]]', 'Old Note')).toBe('a Old Note b old note [[Other]]')
  })
})
