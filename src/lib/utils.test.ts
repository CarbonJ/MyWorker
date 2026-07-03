import { describe, it, expect } from 'vitest'
import { toLocalDateString, localToday, localTomorrow, isOverdue, isDueToday, fmtDate } from './utils'

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
