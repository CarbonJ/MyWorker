/**
 * Calendar load ("hot" / "cold" days) — pure helpers, unit-tested.
 *
 * A day's load is how many things are due that day. It is judged against the
 * average over the next LOOKAHEAD working days, where "working days" follows
 * the business-days setting (Mon–Fri only, or every day). Only today and
 * future working days are rated; past days and, in business mode, weekends
 * are shown without a rating.
 *
 *   hot  — at least HOT_MIN items and at least HOT_RATIO × the average
 *   cold — the average is at least 1 and the day has at most COLD_RATIO × it
 */

import { toLocalDateString } from './utils'

export const HOT_RATIO = 1.5
export const HOT_MIN = 2
export const COLD_RATIO = 0.5
/** Working days in the baseline window: 8 weeks either way. */
export const LOOKAHEAD_BUSINESS_DAYS = 40
export const LOOKAHEAD_CALENDAR_DAYS = 56

export type DayLoad = 'hot' | 'cold' | 'normal' | 'unrated'

export interface LoadBaseline {
  /** Average items due per working day across the window. */
  average: number
  /** A day with this many items or more is hot. */
  hotAt: number
  /** A day with this many items or fewer is cold; null when nothing counts as cold (average below 1). */
  coldAt: number | null
}

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(iso: string, n: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + n)
  return toLocalDateString(d)
}

export function isWeekend(iso: string): boolean {
  const day = parseLocalDate(iso).getDay()
  return day === 0 || day === 6
}

/** Whether a day counts toward load (and gets rated) under the business-days setting. */
export function isWorkingDay(iso: string, businessDays: boolean): boolean {
  return !businessDays || !isWeekend(iso)
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = parseLocalDate(iso).getDay() // 0 = Sun
  return addDays(iso, day === 0 ? -6 : 1 - day)
}

/** The dates shown by a month grid: whole Monday–Sunday weeks covering the month. */
export function monthGridDays(year: number, month: number): string[] {
  const first = toLocalDateString(new Date(year, month, 1, 12))
  const last = toLocalDateString(new Date(year, month + 1, 0, 12))
  const days: string[] = []
  for (let d = weekStart(first); d <= last || parseLocalDate(d).getDay() !== 1; d = addDays(d, 1)) {
    days.push(d)
  }
  return days
}

export function computeBaseline(countByDate: Map<string, number>, today: string, businessDays: boolean): LoadBaseline {
  const target = businessDays ? LOOKAHEAD_BUSINESS_DAYS : LOOKAHEAD_CALENDAR_DAYS
  let total = 0
  let counted = 0
  for (let d = today; counted < target; d = addDays(d, 1)) {
    if (!isWorkingDay(d, businessDays)) continue
    total += countByDate.get(d) ?? 0
    counted++
  }
  const average = total / counted
  return {
    average,
    hotAt: Math.max(HOT_MIN, Math.ceil(average * HOT_RATIO)),
    coldAt: average >= 1 ? Math.floor(average * COLD_RATIO) : null,
  }
}

export function rateDay(iso: string, count: number, today: string, businessDays: boolean, baseline: LoadBaseline): DayLoad {
  if (iso < today || !isWorkingDay(iso, businessDays)) return 'unrated'
  if (count >= baseline.hotAt) return 'hot'
  if (baseline.coldAt !== null && count <= baseline.coldAt) return 'cold'
  return 'normal'
}
