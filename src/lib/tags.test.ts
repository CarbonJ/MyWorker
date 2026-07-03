import { describe, it, expect } from 'vitest'
import { parseTags, stringifyTags } from './tags'

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
