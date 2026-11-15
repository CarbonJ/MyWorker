import { describe, it, expect } from 'vitest'
import { toLocalDateString } from './utils'
import { computeBaseline, rateDay, monthGridDays, weekStart, isWorkingDay } from './calendarLoad'

describe('calendar dates', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-14')).toBe('2026-11-09') // Saturday
    expect(weekStart('2026-11-15')).toBe('2026-11-09') // Sunday
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // Monday
  })

  it('month grid covers whole weeks', () => {
    const days = monthGridDays(2026, 10) // November 2026: starts Sunday, ends Monday
    expect(days[0]).toBe('2026-10-26')
    expect(days[days.length - 1]).toBe('2026-12-06')
    expect(days.length % 7).toBe(0)
  })

  it('weekends only count when business days are off', () => {
    expect(isWorkingDay('2026-11-14', true)).toBe(false)
    expect(isWorkingDay('2026-11-14', false)).toBe(true)
  })
})

describe('day load', () => {
  const today = '2026-11-16' // Monday

  it('rates days against the working-day average', () => {
    // 2 items on every weekday for 8 weeks → average 2, hot at 3, cold at 1
    const counts = new Map<string, number>()
    for (let i = 0; i < 56; i++) {
      const d = new Date(2026, 10, 16 + i, 12)
      if (d.getDay() !== 0 && d.getDay() !== 6) counts.set(toLocalDateString(d), 2)
    }
    const b = computeBaseline(counts, today, true)
    expect(b.average).toBeCloseTo(2)
    expect(b.hotAt).toBe(3)
    expect(b.coldAt).toBe(1)
    expect(rateDay('2026-11-17', 3, today, true, b)).toBe('hot')
    expect(rateDay('2026-11-17', 2, today, true, b)).toBe('normal')
    expect(rateDay('2026-11-17', 0, today, true, b)).toBe('cold')
  })

  it('never rates past days or weekends in business mode', () => {
    const b = { average: 2, hotAt: 3, coldAt: 1 }
    expect(rateDay('2026-11-13', 9, today, true, b)).toBe('unrated')
    expect(rateDay('2026-11-21', 9, today, true, b)).toBe('unrated')
    expect(rateDay('2026-11-21', 9, today, false, b)).toBe('hot')
  })

  it('a quiet schedule has no cold days, and one item is never hot', () => {
    const b = computeBaseline(new Map([['2026-11-17', 1]]), today, true)
    expect(b.coldAt).toBeNull()
    expect(b.hotAt).toBe(2)
    expect(rateDay('2026-11-17', 1, today, true, b)).toBe('normal')
  })
})
