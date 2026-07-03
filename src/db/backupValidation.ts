/**
 * Backup file validation — pure functions with no database dependency,
 * extracted from importExport.ts so they can be unit-tested without loading
 * the wa-sqlite WASM stack.
 *
 * validateBackupData() checks the whole file before any data is touched:
 * if it returns without throwing, the restore transaction can proceed.
 */

import { EXPORT_FORMAT_VERSION } from './backupSchema'

export interface ExportData {
  version: number
  exportedAt?: string
  savedAt?: string
  projects: Record<string, unknown>[]
  workLogEntries?: Record<string, unknown>[]
  tasks?: Record<string, unknown>[]
  dropdownOptions?: Record<string, unknown>[]
  // v2 additions
  contacts?: Record<string, unknown>[]
  notebookPages?: Record<string, unknown>[]
  savedViews?: Record<string, unknown>[]
  /** myworker:* localStorage keys (UI prefs, filters, digest meeting notes). */
  localPrefs?: Record<string, string>
}

/** Matches YYYY-MM-DD (basic ISO date format check). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function requireIsoDate(value: unknown, label: string): void {
  if (value !== null && value !== undefined) {
    if (typeof value !== 'string' || !ISO_DATE_RE.test(value))
      throw new Error(`${label}: must be a YYYY-MM-DD date string, got "${value}"`)
  }
}

/**
 * Validate a parsed backup object. Throws with a specific message on the
 * first problem found; returns the object typed as ExportData on success.
 */
export function validateBackupData(raw: unknown): ExportData {
  const data = raw as ExportData

  // --- Top-level shape ---
  if (typeof data?.version !== 'number' || !Array.isArray(data.projects)) {
    throw new Error('Invalid backup file: missing or wrong-typed required fields.')
  }
  if (data.version > EXPORT_FORMAT_VERSION) {
    throw new Error(
      `Backup format v${data.version} is newer than this app supports (v${EXPORT_FORMAT_VERSION}). Update the app first.`,
    )
  }
  const optionalArrayKeys = [
    'dropdownOptions', 'workLogEntries', 'tasks',
    'contacts', 'notebookPages', 'savedViews',
  ] as const
  for (const key of optionalArrayKeys) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Invalid backup file: "${key}" must be an array.`)
    }
  }
  if (data.localPrefs !== undefined &&
      (typeof data.localPrefs !== 'object' || data.localPrefs === null || Array.isArray(data.localPrefs))) {
    throw new Error('Invalid backup file: "localPrefs" must be an object.')
  }

  // --- Per-record validation ---
  const validRag = new Set(['Red', 'Amber', 'Green'])
  const validTaskStatus = new Set(['open', 'in_progress', 'done'])
  const validDropdownType = new Set(['priority', 'product_area', 'project_status'])

  for (const [i, opt] of (data.dropdownOptions ?? []).entries()) {
    if (typeof opt.id !== 'number' || opt.id <= 0)
      throw new Error(`dropdownOptions[${i}]: invalid id`)
    if (!validDropdownType.has(opt.type as string))
      throw new Error(`dropdownOptions[${i}]: invalid type "${opt.type}"`)
    if (typeof opt.label !== 'string' || !(opt.label as string).trim())
      throw new Error(`dropdownOptions[${i}]: label must be a non-empty string`)
  }

  // Build a set of valid project IDs for referential integrity checks below.
  const projectIds = new Set(data.projects.map(p => p.id as number))

  for (const [i, p] of data.projects.entries()) {
    if (typeof p.id !== 'number' || p.id <= 0)
      throw new Error(`projects[${i}]: invalid id`)
    if (typeof p.work_item !== 'string' || !(p.work_item as string).trim())
      throw new Error(`projects[${i}]: work_item must be a non-empty string`)
    if (!validRag.has(p.rag_status as string))
      throw new Error(`projects[${i}]: invalid rag_status "${p.rag_status}"`)
  }

  for (const [i, e] of (data.workLogEntries ?? []).entries()) {
    if (typeof e.id !== 'number' || e.id <= 0)
      throw new Error(`workLogEntries[${i}]: invalid id`)
    if (typeof e.project_id !== 'number' || e.project_id <= 0)
      throw new Error(`workLogEntries[${i}]: invalid project_id`)
    if (!projectIds.has(e.project_id as number))
      throw new Error(`workLogEntries[${i}]: project_id ${e.project_id} does not match any project in the backup`)
    if (typeof e.note !== 'string')
      throw new Error(`workLogEntries[${i}]: note must be a string`)
  }

  for (const [i, t] of (data.tasks ?? []).entries()) {
    if (typeof t.id !== 'number' || t.id <= 0)
      throw new Error(`tasks[${i}]: invalid id`)
    if (typeof t.project_id !== 'number' && t.project_id !== null && t.project_id !== undefined)
      throw new Error(`tasks[${i}]: project_id must be a number or null`)
    if (typeof t.project_id === 'number' && !projectIds.has(t.project_id))
      throw new Error(`tasks[${i}]: project_id ${t.project_id} does not match any project in the backup`)
    if (typeof t.title !== 'string' || !(t.title as string).trim())
      throw new Error(`tasks[${i}]: title must be a non-empty string`)
    if (!validTaskStatus.has(t.status as string))
      throw new Error(`tasks[${i}]: invalid status "${t.status}"`)
    requireIsoDate(t.start_date, `tasks[${i}].start_date`)
    requireIsoDate(t.due_date,   `tasks[${i}].due_date`)
  }

  for (const [i, c] of (data.contacts ?? []).entries()) {
    if (typeof c.id !== 'number' || c.id <= 0)
      throw new Error(`contacts[${i}]: invalid id`)
    if (typeof c.name !== 'string' || !(c.name as string).trim())
      throw new Error(`contacts[${i}]: name must be a non-empty string`)
  }

  for (const [i, n] of (data.notebookPages ?? []).entries()) {
    if (typeof n.id !== 'number' || n.id <= 0)
      throw new Error(`notebookPages[${i}]: invalid id`)
    if (typeof n.title !== 'string')
      throw new Error(`notebookPages[${i}]: title must be a string`)
    if (typeof n.body !== 'string')
      throw new Error(`notebookPages[${i}]: body must be a string`)
  }

  for (const [i, v] of (data.savedViews ?? []).entries()) {
    if (typeof v.page !== 'string' || !(v.page as string).trim())
      throw new Error(`savedViews[${i}]: page must be a non-empty string`)
    if (typeof v.name !== 'string' || !(v.name as string).trim())
      throw new Error(`savedViews[${i}]: name must be a non-empty string`)
    if (typeof v.data !== 'string')
      throw new Error(`savedViews[${i}]: data must be a string`)
  }

  return data
}
