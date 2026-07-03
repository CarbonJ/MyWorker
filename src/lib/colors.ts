/**
 * Shared color mappings for dropdown option pills and status indicators.
 *
 * All RAG, priority, and project-status color styling across the app
 * imports from here. Change a color in one place and it updates everywhere.
 */

import type { RagStatus } from '@/types'

/** Tailwind classes for a colored pill/badge (background + text + border). */
export const COLOR_CLASS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
  amber:  'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  green:  'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
  blue:   'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900',
  grey:   'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
}

/** Tailwind classes for a small colored dot indicator. */
export const DOT_CLASS: Record<string, string> = {
  red:    'bg-red-500 dark:bg-red-700',
  orange: 'bg-orange-500 dark:bg-orange-700',
  amber:  'bg-amber-500 dark:bg-amber-700',
  green:  'bg-green-500 dark:bg-green-700',
  blue:   'bg-blue-500 dark:bg-blue-700',
  purple: 'bg-purple-500 dark:bg-purple-700',
  grey:   'bg-slate-400 dark:bg-slate-600',
}

/** Sort weight for RAG status — Red is most urgent (0), Green is least (2). */
export const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

/** Canonical RAG status → palette color key. */
export const RAG_COLOR: Record<RagStatus, string> = { Red: 'red', Amber: 'amber', Green: 'green' }

/** Shared RAG option list for filters and pickers. */
export const RAG_OPTIONS: { value: RagStatus; label: string; dotColor: string }[] = [
  { value: 'Green', label: 'Green', dotColor: DOT_CLASS.green },
  { value: 'Amber', label: 'Amber', dotColor: DOT_CLASS.amber },
  { value: 'Red',   label: 'Red',   dotColor: DOT_CLASS.red },
]

/**
 * Dot classes for a dot rendered ON a tinted pill background. Unlike DOT_CLASS,
 * the saturated shade is kept in dark mode — a *-700 dot on the pill's *-950
 * background falls below 3:1 contrast and vanishes.
 */
export const DOT_ON_PILL_CLASS: Record<string, string> = {
  red:    'bg-red-500',
  orange: 'bg-orange-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
  grey:   'bg-slate-400 dark:bg-slate-500',
}

/** Returns the on-pill dot class for a given color string, with a safe fallback. */
export function dotOnPillClass(color: string): string {
  return DOT_ON_PILL_CLASS[color] ?? DOT_ON_PILL_CLASS.grey
}

/** Tailwind classes for a dimmed/inactive pill (e.g. filter chips outside the active set). */
export const PILL_DIMMED_CLASS =
  'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-800'

/** Tailwind classes for a filled/active colored pill (solid background + white text). */
export const COLOR_CLASS_ACTIVE: Record<string, string> = {
  red:    'bg-red-500    text-white border-red-500    dark:bg-red-700    dark:border-red-700',
  orange: 'bg-orange-500 text-white border-orange-500 dark:bg-orange-700 dark:border-orange-700',
  amber:  'bg-amber-500  text-white border-amber-500  dark:bg-amber-700  dark:border-amber-700',
  green:  'bg-green-500  text-white border-green-500  dark:bg-green-700  dark:border-green-700',
  blue:   'bg-blue-500   text-white border-blue-500   dark:bg-blue-700   dark:border-blue-700',
  purple: 'bg-purple-500 text-white border-purple-500 dark:bg-purple-700 dark:border-purple-700',
  grey:   'bg-slate-500  text-white border-slate-500  dark:bg-slate-600  dark:border-slate-600',
}

/** Returns the pill class for a given color string, with a safe fallback. */
export function pillClass(color: string): string {
  return COLOR_CLASS[color] ?? COLOR_CLASS.grey
}

/** Returns the filled/active pill class for a given color string (for selected state). */
export function pillClassActive(color: string): string {
  return COLOR_CLASS_ACTIVE[color] ?? 'bg-slate-500 text-white border-slate-500'
}

/** Returns the dot class for a given color string, with a safe fallback. */
export function dotClass(color: string): string {
  return DOT_CLASS[color] ?? DOT_CLASS.grey
}

/** Tailwind text-color classes for a given color string. */
export const TEXT_CLASS: Record<string, string> = {
  red:    'text-red-700 dark:text-red-400',
  orange: 'text-orange-700 dark:text-orange-400',
  amber:  'text-amber-700 dark:text-amber-400',
  green:  'text-green-700 dark:text-green-400',
  blue:   'text-blue-700 dark:text-blue-400',
  purple: 'text-purple-700 dark:text-purple-400',
  grey:   'text-slate-600 dark:text-slate-400',
}

/** Returns the text color class for a given color string, with a safe fallback. */
export function textClass(color: string): string {
  return TEXT_CLASS[color] ?? 'text-muted-foreground'
}
