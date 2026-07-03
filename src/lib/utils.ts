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

/** Returns true if the given due date is strictly before today (overdue). */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return dueDate < localToday()
}

/** Returns true if the given due date is today. */
export function isDueToday(dueDate: string | null): boolean {
  return !!dueDate && dueDate === localToday()
}
