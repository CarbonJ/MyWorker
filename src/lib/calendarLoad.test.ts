import { describe, it, expect } from 'vitest'
import { toLocalDateString } from './utils'
import {
  computeBaseline, rateDay, levelFor, levelRanges, monthGridDays, weekStart, weekDays, weeksBetweenMonths, addMonths,
  isWorkingDay, displayDate,
} from './calendarLoad'

/** Counts for the 40 business days from Mon 16 Nov 2026, by weekday pattern. */
function businessCounts(perDay: number[]): Map<string, number> {
  const counts = new Map<string, number>()
  let i = 0
  for (let n = 0; i < perDay.length; n++) {
    const d = new Date(2026, 10, 16 + n, 12)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    counts.set(toLocalDateString(d), perDay[i++])
  }
  return counts
}

describe('calendar dates', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-14')).toBe('2026-11-09') // Saturday
    expect(weekStart('2026-11-15')).toBe('2026-11-09') // Sunday
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // Monday
  })

  it('business weeks have no weekend', () => {
    expect(weekDays('2026-11-18', true)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
    expect(weekDays('2026-11-18', false)).toHaveLength(7)
  })

  it('month grid covers whole weeks, weekdays only in business mode', () => {
    const all = monthGridDays(2026, 10, false) // November 2026: starts Sunday, ends Monday
    expect(all[0]).toBe('2026-10-26')
    expect(all[all.length - 1]).toBe('2026-12-06')
    expect(all.length % 7).toBe(0)
    const work = monthGridDays(2026, 10, true)
    expect(work.length % 5).toBe(0)
    expect(work.some(d => !isWorkingDay(d, true))).toBe(false)
  })

  it('weekend items move to the Friday before in business mode', () => {
    expect(displayDate('2026-11-21', true)).toBe('2026-11-20') // Sat
    expect(displayDate('2026-11-22', true)).toBe('2026-11-20') // Sun
    expect(displayDate('2026-11-23', true)).toBe('2026-11-23') // Mon
    expect(displayDate('2026-11-21', false)).toBe('2026-11-21')
  })
})

describe('load levels', () => {
  const today = '2026-11-16'
  // Test-data shape: avg 1.425 over 40 business days
  const typical = [6,0,2,1,2, 1,2,0,4,1, 2,1,2,1,3, 1,2,1,2,1, 2,1,5,1,2, 1,0,1,0,0, 0,1,1,0,0, 2,1,2,1,1]

  it('grades a typical schedule: 0 free, 1 light, 2 normal, 3 busy, 4+ overloaded', () => {
    const b = computeBaseline(businessCounts(typical), today, true)
    expect(b.normal).toBeCloseTo(1.4, 1)
    expect([0, 1, 2, 3, 4, 6].map(n => levelFor(n, b)))
      .toEqual(['free', 'light', 'normal', 'busy', 'overloaded', 'overloaded'])
    expect(levelRanges(b).map(r => `${r.level}:${r.label}`))
      .toEqual(['free:0', 'light:1', 'normal:2', 'busy:3', 'overloaded:4+'])
  })

  it('one 20-item day does not shift every other day', () => {
    const withPileUp = [...typical]
    withPileUp[3] = 20
    const b = computeBaseline(businessCounts(withPileUp), today, true)
    expect([1, 2, 3].map(n => levelFor(n, b))).toEqual(['light', 'normal', 'busy'])
    expect(levelFor(20, b)).toBe('overloaded')
  })

  it('uses a normal load set in Settings', () => {
    const b = computeBaseline(new Map(), today, true, 4)
    expect(b).toEqual({ normal: 4, source: 'set' })
    expect([1, 3, 4, 6, 10].map(n => levelFor(n, b))).toEqual(['light', 'light', 'normal', 'busy', 'overloaded'])
  })

  it('a single item is never busy, even on an empty schedule', () => {
    const b = computeBaseline(new Map(), today, true)
    expect(levelFor(1, b)).toBe('normal')
    expect(levelFor(2, b)).toBe('busy')
  })

  it('never rates past days, or weekends in business mode', () => {
    const b = { normal: 1.4, source: 'auto' as const }
    expect(rateDay('2026-11-13', 9, today, true, b)).toBe('unrated')
    expect(rateDay('2026-11-21', 9, today, true, b)).toBe('unrated')
    expect(rateDay('2026-11-21', 9, today, false, b)).toBe('overloaded')
  })
})

describe('weeksBetweenMonths', () => {
  it('covers whole weeks from the first month to the last, without gaps', () => {
    const weeks = weeksBetweenMonths('2026-11', '2026-12', false)
    expect(weeks[0][0]).toBe('2026-10-26') // Monday before Sun 1 Nov
    expect(weeks.at(-1)!.at(-1)).toBe('2027-01-03') // Sunday after Thu 31 Dec
    for (let i = 1; i < weeks.length; i++) expect(weeks[i][0] > weeks[i - 1].at(-1)!).toBe(true)
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })

  it('has Mon–Fri rows in business mode', () => {
    expect(weeksBetweenMonths('2026-11', '2026-11', true).every(w => w.length === 5)).toBe(true)
  })
})

describe('addMonths', () => {
  it('shifts across year ends from any day of the month', () => {
    expect(addMonths('2026-11-30', 1)).toBe('2026-12')
    expect(addMonths('2026-12-31', 2)).toBe('2027-02')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12')
  })
})
