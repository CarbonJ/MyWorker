/**
 * Calendar and performance-year quarters, for grouping by date.
 *
 * The performance year (PY) starts on 1 October and is named for the calendar
 * year it ends in: PY2026 runs 1 Oct 2025 – 30 Sep 2026, and its Q1 is
 * Oct–Dec 2025.
 */

export type QuarterKind = 'calendar' | 'performance'

/** First month (1–12) of the performance year. */
export const PERFORMANCE_YEAR_START_MONTH: number = 10

export interface Quarter {
  /** Sortable key, e.g. "2026-Q1" (for a PY quarter the year is the PY's year). */
  key: string
  /** e.g. "Q1 2026" or "PY2026 Q1" */
  label: string
  /** The months covered, e.g. "Oct – Dec 2025" */
  range: string
}

const MONTH = (y: number, m: number) =>
  new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: 'short' })

/** The quarter a local 'YYYY-MM-DD' (or longer ISO) date falls in. */
export function quarterOf(date: string, kind: QuarterKind): Quarter {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  if (kind === 'calendar') {
    const q = Math.ceil(m / 3)
    const first = (q - 1) * 3 + 1
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, range: `${MONTH(y, first)} – ${MONTH(y, first + 2)} ${y}` }
  }
  const start = PERFORMANCE_YEAR_START_MONTH
  // Months since the PY began (0–11), and the PY's name (the year it ends in)
  const offset = (m - start + 12) % 12
  const py = start === 1 ? y : m >= start ? y + 1 : y
  const q = Math.floor(offset / 3) + 1
  const firstMonthIndex = start - 1 + (q - 1) * 3 // 0-based, may pass December
  const firstYear = py - (start === 1 ? 0 : 1) + Math.floor(firstMonthIndex / 12)
  const first = (firstMonthIndex % 12) + 1
  const last = ((firstMonthIndex + 2) % 12) + 1
  const lastYear = firstYear + Math.floor(((firstMonthIndex % 12) + 2) / 12)
  const range = firstYear === lastYear
    ? `${MONTH(firstYear, first)} – ${MONTH(lastYear, last)} ${lastYear}`
    : `${MONTH(firstYear, first)} ${firstYear} – ${MONTH(lastYear, last)} ${lastYear}`
  return { key: `${py}-Q${q}`, label: `PY${py} Q${q}`, range }
}
