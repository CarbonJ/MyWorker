/**
 * Which daily snapshots (MyWorkerSnapshots/myworker-YYYY-MM-DD.json) to keep:
 * every one from the last DAILY_DAYS days, plus the earliest one of each month
 * for the last MONTHLY_MONTHS months — so a loss noticed months later can still
 * be recovered.
 */

import { toLocalDateString } from './utils'

export const DAILY_DAYS = 30
export const MONTHLY_MONTHS = 12

/** The snapshot dates (YYYY-MM-DD) to delete, given every date present and today. */
export function snapshotsToPrune(dates: string[], today: string): string[] {
  const [y, m, d] = today.split('-').map(Number)
  const dailyCutoff = toLocalDateString(new Date(y, m - 1, d - DAILY_DAYS, 12))
  const monthlyCutoff = toLocalDateString(new Date(y, m - 1 - MONTHLY_MONTHS, 1, 12)).slice(0, 7)

  const firstOfMonth = new Map<string, string>()
  for (const date of [...dates].sort()) {
    const month = date.slice(0, 7)
    if (!firstOfMonth.has(month)) firstOfMonth.set(month, date)
  }
  return dates.filter(date => {
    if (date >= dailyCutoff) return false
    const month = date.slice(0, 7)
    return !(month > monthlyCutoff && firstOfMonth.get(month) === date)
  })
}
