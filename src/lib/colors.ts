/**
 * Shared color mappings for dropdown option pills and status indicators.
 *
 * All RAG, priority, and project-status color styling across the app
 * imports from here. Change a color in one place and it updates everywhere.
 */

import type { RagStatus } from '@/types'

/** Tailwind classes for a colored pill/badge (background + text + border). */
export const COLOR_CLASS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
  green:  'bg-green-100 text-green-700 border-green-200',
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  grey:   'bg-slate-100 text-slate-600 border-slate-200',
}

/** Tailwind classes for a small colored dot indicator. */
export const DOT_CLASS: Record<string, string> = {
  red:    'bg-red-500',
  orange: 'bg-orange-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
  grey:   'bg-slate-400',
}

/** Sort weight for RAG status — Red is most urgent (0), Green is least (2). */
export const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

/** Tailwind classes for a filled/active colored pill (solid background + white text). */
export const COLOR_CLASS_ACTIVE: Record<string, string> = {
  red:    'bg-red-500    text-white border-red-500',
  orange: 'bg-orange-500 text-white border-orange-500',
  amber:  'bg-amber-500  text-white border-amber-500',
  green:  'bg-green-500  text-white border-green-500',
  blue:   'bg-blue-500   text-white border-blue-500',
  purple: 'bg-purple-500 text-white border-purple-500',
  grey:   'bg-slate-500  text-white border-slate-500',
}

/** Returns the pill class for a given color string, with a safe fallback. */
export function pillClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

/** Returns the filled/active pill class for a given color string (for selected state). */
export function pillClassActive(color: string): string {
  return COLOR_CLASS_ACTIVE[color] ?? 'bg-slate-500 text-white border-slate-500'
}

/** Returns the dot class for a given color string, with a safe fallback. */
export function dotClass(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}
