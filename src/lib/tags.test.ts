import { describe, it, expect } from 'vitest'
import { parseTags, stringifyTags, findHashtags, extractHashtags, replaceHashtag, replaceInTagList, isHashtagName, isHexColour } from './tags'

describe('parseTags', () => {
  it('parses a JSON array', () => {
    expect(parseTags('["risk","q3"]')).toEqual(['risk', 'q3'])
  })

  it('returns [] for empty or blank input', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('   ')).toEqual([])
  })

  it('returns [] for non-array JSON', () => {
    expect(parseTags('{"a":1}')).toEqual([])
  })

  it('returns [] for garbage without the legacy flag', () => {
    expect(parseTags('risk, q3')).toEqual([])
  })

  it('falls back to comma-splitting with the legacy flag (contacts)', () => {
    expect(parseTags('risk, q3', true)).toEqual(['risk', 'q3'])
  })
})

describe('stringifyTags', () => {
  it('round-trips through parseTags', () => {
    expect(parseTags(stringifyTags(['a', 'b']))).toEqual(['a', 'b'])
  })

  it('stores empty as empty string, not "[]"', () => {
    expect(stringifyTags([])).toBe('')
  })
})

describe('hashtags', () => {
  it('finds tags at the start, after whitespace and after punctuation', () => {
    expect(extractHashtags('#audit met with (#Q3-review) and #vendor/acme today'))
      .toEqual(['audit', 'Q3-review', 'vendor/acme'])
  })

  it('ignores headings, numbers, url anchors and mid-word hashes', () => {
    expect(extractHashtags('# Heading\n## Another\nissue #123 see http://x.com/a#frag and a#b C#sharp')).toEqual([])
  })

  it('ignores code, links and wiki links', () => {
    const md = 'run `git #notatag` then\n```\n#alsonot\n```\n[see #nope](http://x) [[Page #no]] but #yes'
    expect(extractHashtags(md)).toEqual(['yes'])
  })

  it('drops trailing punctuation and unescapes underscores', () => {
    expect(extractHashtags('done #risk-, #follow\\_up. #end_')).toEqual(['risk', 'follow_up', 'end'])
  })

  it('treats case variants as one tag', () => {
    expect(extractHashtags('#Audit and #audit')).toEqual(['Audit'])
  })

  it('reports offsets usable for slicing', () => {
    const text = 'a #risk b'
    const [h] = findHashtags(text)
    expect(text.slice(h.index, h.index + h.length)).toBe('#risk')
  })

  it('renames every occurrence case-insensitively, leaving other tags alone', () => {
    expect(replaceHashtag('#Audit x #audits #audit.', 'audit', 'review')).toBe('#review x #audits #review.')
    expect(replaceHashtag('`#audit` #audit', 'audit', 'review')).toBe('`#audit` #review')
  })

  it('removes the hash when deleting', () => {
    expect(replaceHashtag('the #audit plan', 'audit', null)).toBe('the audit plan')
  })

  it('rewrites tag lists and collapses duplicates', () => {
    expect(replaceInTagList(['Audit', 'q3', 'review'], 'audit', 'review')).toEqual(['review', 'q3'])
    expect(replaceInTagList(['Audit', 'q3'], 'audit', null)).toEqual(['q3'])
  })

  it('validates inline-compatible names', () => {
    expect(isHashtagName('vendor/acme-2')).toBe(true)
    expect(isHashtagName('two words')).toBe(false)
    expect(isHashtagName('3q')).toBe(false)
  })
})

describe('hex colours', () => {
  it('are not tags', () => {
    expect(extractHashtags('colour #fff, #FAFAFA and #deadbeef but #audit')).toEqual(['audit'])
  })

  it('keeps real words that look like hex', () => {
    expect(extractHashtags('#bad #add #cafe #facade')).toEqual(['bad', 'add', 'cafe'])
  })

  it('classifies names', () => {
    expect(isHexColour('fff')).toBe(true)
    expect(isHexColour('a1b2c3')).toBe(true)
    expect(isHexColour('bad')).toBe(false)
    expect(isHexColour('risk')).toBe(false)
  })
})
