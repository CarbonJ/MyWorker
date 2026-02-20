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

/** Returns true if the given due date is strictly before today (overdue). */
export function isOverdue(dueDate: string | null): boolean {
  return !!dueDate && new Date(dueDate) < new Date(new Date().toDateString())
}

/** Returns true if the given due date is today. */
export function isDueToday(dueDate: string | null): boolean {
  return !!dueDate && dueDate === new Date().toISOString().slice(0, 10)
}
