import { describe, it, expect } from 'vitest'
import { quarterOf } from './quarters'

describe('quarterOf', () => {
  it('calendar quarters', () => {
    expect(quarterOf('2026-01-01', 'calendar')).toMatchObject({ key: '2026-Q1', label: 'Q1 2026' })
    expect(quarterOf('2026-03-31', 'calendar').key).toBe('2026-Q1')
    expect(quarterOf('2026-04-01', 'calendar').key).toBe('2026-Q2')
    expect(quarterOf('2026-12-31 23:59:00', 'calendar').key).toBe('2026-Q4')
  })

  it('performance-year quarters start on 1 October and are named for the year they end in', () => {
    expect(quarterOf('2025-10-01', 'performance')).toMatchObject({ key: '2026-Q1', label: 'PY2026 Q1' })
    expect(quarterOf('2025-12-31', 'performance').key).toBe('2026-Q1')
    expect(quarterOf('2026-01-01', 'performance').key).toBe('2026-Q2')
    expect(quarterOf('2026-06-30', 'performance').key).toBe('2026-Q3')
    expect(quarterOf('2026-09-30', 'performance').key).toBe('2026-Q4')
    expect(quarterOf('2026-10-01', 'performance').key).toBe('2027-Q1')
  })

  it('describes the months covered', () => {
    expect(quarterOf('2025-11-15', 'performance').range).toMatch(/2025/)
    expect(quarterOf('2025-11-15', 'performance').range).not.toMatch(/2026/)
    expect(quarterOf('2026-08-15', 'performance').range).toMatch(/2026$/)
  })

  it('sorts newest first by key', () => {
    const keys = ['2025-10-05', '2026-02-01', '2026-11-01'].map(d => quarterOf(d, 'performance').key)
    expect([...keys].sort().reverse()).toEqual(['2027-Q1', '2026-Q2', '2026-Q1'])
  })
})
