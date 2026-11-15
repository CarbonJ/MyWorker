/**
 * Calendar load — how busy each day is. Pure helpers, unit-tested.
 *
 * Working days follow the business-days setting. With it on, only Mon–Fri
 * exist on the calendar: anything due on a Saturday or Sunday is placed on
 * (and counts toward) the Friday before it.
 *
 * A day's level compares its item count with a "normal" daily load:
 *   free        0 items
 *   light       under LIGHT_BELOW × normal
 *   normal      up to BUSY_AT × normal
 *   busy        BUSY_AT × normal or more (and at least 2 items)
 *   overloaded  OVERLOADED_AT × normal or more (and at least 3 items)
 *
 * Normal is either set by the user (Settings) or, on Auto, the average per
 * working day over the next 8 weeks — with each day capped at CAP_RATIO × the
 * plain average first, so one pile-up day can't drag the baseline up for every
 * other day. Only today and future days are rated.
 */

import { toLocalDateString } from './utils'

export const LIGHT_BELOW = 0.8
export const BUSY_AT = 1.5
export const OVERLOADED_AT = 2.5
export const CAP_RATIO = 3
/** Working days in the Auto baseline window: 8 weeks either way. */
export const LOOKAHEAD_BUSINESS_DAYS = 40
export const LOOKAHEAD_CALENDAR_DAYS = 56
/** Below this, a normal load is treated as this (avoids dividing by ~0 on an empty schedule). */
const MIN_NORMAL = 0.5

export type LoadLevel = 'free' | 'light' | 'normal' | 'busy' | 'overloaded' | 'unrated'

export const LEVEL_ORDER: Exclude<LoadLevel, 'unrated'>[] = ['free', 'light', 'normal', 'busy', 'overloaded']

export interface LoadBaseline {
  /** Items per working day that count as a normal day. */
  normal: number
  /** 'set' when the user entered a value in Settings, else 'auto'. */
  source: 'auto' | 'set'
}

/** localStorage key for the user's normal daily load ('' or missing = Auto). */
export const NORMAL_LOAD_KEY = 'myworker:calendar-normal-load'

/** The user's normal daily load from Settings, or null for Auto. */
export function loadNormalLoadSetting(): number | null {
  try {
    const n = Number(localStorage.getItem(NORMAL_LOAD_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
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

/** Whether a day appears on the calendar (and is rated) under the business-days setting. */
export function isWorkingDay(iso: string, businessDays: boolean): boolean {
  return !businessDays || !isWeekend(iso)
}

/**
 * The calendar day an item due on `iso` is shown on: itself, or — in business
 * mode — the Friday before a weekend date.
 */
export function displayDate(iso: string, businessDays: boolean): string {
  if (!businessDays) return iso
  const day = parseLocalDate(iso).getDay()
  return day === 6 ? addDays(iso, -1) : day === 0 ? addDays(iso, -2) : iso
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = parseLocalDate(iso).getDay() // 0 = Sun
  return addDays(iso, day === 0 ? -6 : 1 - day)
}

/** The days of the week containing `iso`: Mon–Fri in business mode, else Mon–Sun. */
export function weekDays(iso: string, businessDays: boolean): string[] {
  const start = weekStart(iso)
  return Array.from({ length: businessDays ? 5 : 7 }, (_, i) => addDays(start, i))
}

/** The days shown by a month grid: whole weeks covering the month (Mon–Fri rows in business mode). */
export function monthGridDays(year: number, month: number, businessDays: boolean): string[] {
  const first = toLocalDateString(new Date(year, month, 1, 12))
  const last = toLocalDateString(new Date(year, month + 1, 0, 12))
  const days: string[] = []
  for (let d = weekStart(first); d <= last || parseLocalDate(d).getDay() !== 1; d = addDays(d, 1)) {
    if (isWorkingDay(d, businessDays)) days.push(d)
  }
  return days
}

/**
 * Normal daily load. `countByDay` is keyed by display date (weekend items
 * already moved to Friday in business mode).
 */
export function computeBaseline(
  countByDay: Map<string, number>,
  today: string,
  businessDays: boolean,
  setNormal: number | null = null,
): LoadBaseline {
  if (setNormal !== null) return { normal: setNormal, source: 'set' }

  const target = businessDays ? LOOKAHEAD_BUSINESS_DAYS : LOOKAHEAD_CALENDAR_DAYS
  const counts: number[] = []
  for (let d = today; counts.length < target; d = addDays(d, 1)) {
    if (isWorkingDay(d, businessDays)) counts.push(countByDay.get(d) ?? 0)
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  // Cap pile-up days so a single 20-item day can't shift every other day's level
  const cap = Math.max(3, CAP_RATIO * mean)
  const capped = counts.reduce((a, b) => a + Math.min(b, cap), 0) / counts.length
  return { normal: capped, source: 'auto' }
}

/** Load level of a number of items against a baseline, ignoring dates. */
export function levelFor(count: number, baseline: LoadBaseline): Exclude<LoadLevel, 'unrated'> {
  if (count === 0) return 'free'
  const ratio = count / Math.max(baseline.normal, MIN_NORMAL)
  if (ratio >= OVERLOADED_AT && count >= 3) return 'overloaded'
  if (ratio >= BUSY_AT && count >= 2) return 'busy'
  if (ratio < LIGHT_BELOW) return 'light'
  return 'normal'
}

/** Load level of a day; past days and non-working days are unrated. */
export function rateDay(iso: string, count: number, today: string, businessDays: boolean, baseline: LoadBaseline): LoadLevel {
  if (iso < today || !isWorkingDay(iso, businessDays)) return 'unrated'
  return levelFor(count, baseline)
}

/**
 * Item-count range for each level under a baseline, for the legend
 * (e.g. light "1", normal "2", busy "3", overloaded "4+"). Levels that no
 * whole number of items reaches are left out.
 */
export function levelRanges(baseline: LoadBaseline): { level: Exclude<LoadLevel, 'unrated'>; label: string }[] {
  const max = 200
  const ranges = new Map<Exclude<LoadLevel, 'unrated'>, [number, number]>()
  for (let n = 0; n <= max; n++) {
    const lvl = levelFor(n, baseline)
    const r = ranges.get(lvl)
    ranges.set(lvl, r ? [r[0], n] : [n, n])
  }
  return LEVEL_ORDER.filter(l => ranges.has(l)).map(level => {
    const [lo, hi] = ranges.get(level)!
    return { level, label: hi === max ? `${lo}+` : lo === hi ? `${lo}` : `${lo}–${hi}` }
  })
}
