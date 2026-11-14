import { describe, it, expect } from 'vitest'
import { toLocalDateString, localToday, localTomorrow, isOverdue, isDueToday, fmtDate, getUpcomingCutoff, nextDayShortcut } from './utils'

function shiftDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

describe('toLocalDateString', () => {
  it('formats using local calendar fields, zero-padded', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('uses the local date even for times that cross UTC midnight', () => {
    // 23:30 local on Jan 5 — in any UTC+ timezone toISOString() would say Jan 5/6 differently;
    // local formatting must always say Jan 5.
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('localToday / localTomorrow', () => {
  it('agree with toLocalDateString', () => {
    expect(localToday()).toBe(toLocalDateString(new Date()))
    expect(localTomorrow()).toBe(shiftDays(1))
  })
})

describe('isOverdue', () => {
  it('is true only strictly before today', () => {
    expect(isOverdue(shiftDays(-1))).toBe(true)
    expect(isOverdue(localToday())).toBe(false)
    expect(isOverdue(shiftDays(1))).toBe(false)
    expect(isOverdue(null)).toBe(false)
  })
})

describe('isDueToday', () => {
  it('matches only today', () => {
    expect(isDueToday(localToday())).toBe(true)
    expect(isDueToday(shiftDays(-1))).toBe(false)
    expect(isDueToday(null)).toBe(false)
  })
})

describe('fmtDate', () => {
  it('formats ISO date as MM/DD/YY', () => {
    expect(fmtDate('2026-07-02')).toBe('07/02/26')
  })
})

describe('getUpcomingCutoff', () => {
  const thu = new Date(2026, 10, 12) // Thu Nov 12 2026
  const fri = new Date(2026, 10, 13)
  const sat = new Date(2026, 10, 14)

  it('business days skip weekends', () => {
    expect(getUpcomingCutoff('1', true, thu)).toBe('2026-11-13')
    expect(getUpcomingCutoff('1', true, fri)).toBe('2026-11-16')
    expect(getUpcomingCutoff('1', true, sat)).toBe('2026-11-16')
    expect(getUpcomingCutoff('3', true, thu)).toBe('2026-11-17')
    expect(getUpcomingCutoff('3', true, fri)).toBe('2026-11-18')
  })

  it('business week ends Friday (next Friday on a weekend)', () => {
    expect(getUpcomingCutoff('week', true, thu)).toBe('2026-11-13')
    expect(getUpcomingCutoff('week', true, fri)).toBe('2026-11-13')
    expect(getUpcomingCutoff('week', true, sat)).toBe('2026-11-20')
  })

  it('calendar days count every day', () => {
    expect(getUpcomingCutoff('1', false, fri)).toBe('2026-11-14')
    expect(getUpcomingCutoff('3', false, fri)).toBe('2026-11-16')
    expect(getUpcomingCutoff('week', false, fri)).toBe('2026-11-20')
  })
})

describe('nextDayShortcut', () => {
  // Business days are the default when the setting has never been saved
  const store = new Map<string, string>()
  globalThis.localStorage ??= { getItem: (k: string) => store.get(k) ?? null } as Storage

  it('offers tomorrow mid-week and Monday on a Friday', () => {
    expect(nextDayShortcut(new Date(2026, 10, 12))).toEqual({ date: '2026-11-13', label: 'Tomorrow' })
    const fri = nextDayShortcut(new Date(2026, 10, 13))
    expect(fri.date).toBe('2026-11-16')
    expect(fri.label).not.toBe('Tomorrow')
  })
})
