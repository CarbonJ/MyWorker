import { describe, it, expect } from 'vitest'
import { parseSearchQuery, buildFtsMatchExpr } from './searchQuery'

describe('parseSearchQuery', () => {
  it('splits words into include terms', () => {
    expect(parseSearchQuery('dog bowl')).toEqual({ include: ['dog', 'bowl'], exclude: [] })
  })

  it('handles NOT keyword', () => {
    expect(parseSearchQuery('dog bowl NOT cat')).toEqual({ include: ['dog', 'bowl'], exclude: ['cat'] })
  })

  it('handles dash shorthand', () => {
    expect(parseSearchQuery('dog bowl -cat')).toEqual({ include: ['dog', 'bowl'], exclude: ['cat'] })
  })

  it('ignores AND keyword (case-insensitive)', () => {
    expect(parseSearchQuery('dog and bowl AND cat')).toEqual({ include: ['dog', 'bowl', 'cat'], exclude: [] })
  })

  it('ignores trailing NOT with no operand', () => {
    expect(parseSearchQuery('dog NOT')).toEqual({ include: ['dog'], exclude: [] })
  })

  it('splits punctuation into separate FTS-safe tokens (previously a syntax error)', () => {
    expect(parseSearchQuery('c++').include).toEqual(['c'])
    expect(parseSearchQuery('foo(bar').include).toEqual(['foo', 'bar'])
    expect(parseSearchQuery('risk-report').include).toEqual(['risk', 'report'])
    expect(parseSearchQuery('a.b:c').include).toEqual(['a', 'b', 'c'])
  })

  it('drops tokens that are pure punctuation', () => {
    expect(parseSearchQuery('dog !!')).toEqual({ include: ['dog'], exclude: [] })
  })

  it('keeps underscores and unicode letters', () => {
    expect(parseSearchQuery('in_progress café').include).toEqual(['in_progress', 'café'])
  })

  it('returns empty lists for blank input', () => {
    expect(parseSearchQuery('   ')).toEqual({ include: [], exclude: [] })
  })
})

describe('buildFtsMatchExpr', () => {
  it('adds prefix wildcards and joins with implicit AND', () => {
    expect(buildFtsMatchExpr({ include: ['dog', 'bowl'], exclude: [] })).toBe('dog* bowl*')
  })

  it('appends NOT clauses', () => {
    expect(buildFtsMatchExpr({ include: ['dog'], exclude: ['cat'] })).toBe('dog* NOT cat*')
  })

  it('returns null when there is nothing to include', () => {
    expect(buildFtsMatchExpr({ include: [], exclude: ['cat'] })).toBeNull()
  })
})
