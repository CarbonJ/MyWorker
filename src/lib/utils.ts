import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an ISO date string (YYYY-MM-DD) for compact display as MM/DD/YY.
 * Sorting should always use the original ISO string, not this formatted value.
 */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

/**
 * Format a Date as YYYY-MM-DD in the user's local timezone.
 * Never use toISOString().slice(0, 10) for calendar dates — that returns the
 * UTC date, which is the wrong day for part of every evening (or the whole
 * day, depending on timezone offset direction).
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Local calendar date (YYYY-MM-DD) of a database timestamp. SQLite's
 * datetime('now') values are UTC ("YYYY-MM-DD HH:MM:SS"), so slicing the first
 * ten characters gives the wrong day around midnight.
 */
export function utcTimestampToLocalDate(ts: string | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
  return Number.isNaN(d.getTime()) ? null : toLocalDateString(d)
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function localToday(): string {
  return toLocalDateString(new Date())
}

/** Tomorrow's date as YYYY-MM-DD in the user's local timezone. */
export function localTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalDateString(d)
}

export type UpcomingMode = '1' | '3' | 'week'

/** localStorage key for the "Tomorrow / 3 days / Week" filters' day counting. */
export const UPCOMING_BUSINESS_DAYS_KEY = 'myworker:upcoming-business-days'

/** Whether the upcoming filters count business days (default) or calendar days. */
export function loadUpcomingBusinessDays(): boolean {
  return localStorage.getItem(UPCOMING_BUSINESS_DAYS_KEY) !== 'false'
}

/**
 * Last date (YYYY-MM-DD, inclusive) covered by an upcoming filter, counted from `from`.
 * Business days: '1' = next business day, '3' = third business day ahead,
 * 'week' = Friday of this week (next Friday on a weekend).
 * Calendar days: '1' = tomorrow, '3' = three days ahead, 'week' = seven days ahead.
 */
export function getUpcomingCutoff(mode: UpcomingMode, businessDays: boolean, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12)
  if (!businessDays) {
    d.setDate(d.getDate() + (mode === '1' ? 1 : mode === '3' ? 3 : 7))
  } else if (mode === 'week') {
    const day = d.getDay() // 0=Sun…6=Sat
    d.setDate(d.getDate() + (day === 0 ? 5 : day === 6 ? 6 : 5 - day))
  } else {
    let remaining = mode === '1' ? 1 : 3
    while (remaining > 0) {
      d.setDate(d.getDate() + 1)
      if (d.getDay() !== 0 && d.getDay() !== 6) remaining--
    }
  }
  return toLocalDateString(d)
}

/**
 * The "next day" quick-pick in date pickers. Follows the same business-days
 * setting as the upcoming filters, so on a Friday it offers Monday rather than
 * Saturday. `label` is "Tomorrow" when that's what the date is, else the weekday.
 */
export function nextDayShortcut(from: Date = new Date()): { date: string; label: string } {
  const date = getUpcomingCutoff('1', loadUpcomingBusinessDays(), from)
  const tomorrow = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 12)
  const label = date === toLocalDateString(tomorrow)
    ? 'Tomorrow'
    : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })
  return { date, label }
}

/** Returns true if the given due date is strictly before today (overdue). */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return dueDate < localToday()
}

/** Returns true if the given due date is today. */
export function isDueToday(dueDate: string | null): boolean {
  return !!dueDate && dueDate === localToday()
}

/**
 * Text classes for rendering a due date: red when overdue, amber when due
 * today, muted otherwise. Single source for the due-date color treatment.
 */
export function dueDateTextClass(dueDate: string | null): string {
  if (!dueDate) return 'text-muted-foreground'
  const today = localToday()
  if (dueDate < today) return 'text-red-600 dark:text-red-400 font-medium'
  if (dueDate === today) return 'text-amber-600 dark:text-amber-400 font-medium'
  return 'text-muted-foreground'
}
