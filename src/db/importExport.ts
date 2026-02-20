/**
 * Import / Export
 *
 * Export: serialises all data to a JSON file and triggers a browser download.
 * Import: reads a previously exported JSON file and restores all data.
 */

import { query, exec, getDb, persistToUserFolder } from './index'

interface ExportData {
  version: number
  exportedAt: string
  projects: Record<string, unknown>[]
  workLogEntries: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  dropdownOptions: Record<string, unknown>[]
}

export async function exportToJson(): Promise<void> {
  const [projects, workLogEntries, tasks, dropdownOptions] = await Promise.all([
    query('SELECT * FROM projects ORDER BY id ASC'),
    query('SELECT * FROM work_log_entries ORDER BY id ASC'),
    query('SELECT * FROM tasks ORDER BY id ASC'),
    query('SELECT * FROM dropdown_options ORDER BY id ASC'),
  ])

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    workLogEntries,
    tasks,
    dropdownOptions,
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `myworker-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importFromJson(file: File): Promise<void> {
  const text = await file.text()
  const data: ExportData = JSON.parse(text)

  // --- Validate top-level shape ---
  if (typeof data.version !== 'number' || !Array.isArray(data.projects)) {
    throw new Error('Invalid backup file: missing or wrong-typed required fields.')
  }
  const optionalArrayKeys = ['dropdownOptions', 'workLogEntries', 'tasks'] as const
  for (const key of optionalArrayKeys) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Invalid backup file: "${key}" must be an array.`)
    }
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
    if (typeof e.note !== 'string')
      throw new Error(`workLogEntries[${i}]: note must be a string`)
  }

  for (const [i, t] of (data.tasks ?? []).entries()) {
    if (typeof t.id !== 'number' || t.id <= 0)
      throw new Error(`tasks[${i}]: invalid id`)
    if (typeof t.project_id !== 'number' || t.project_id <= 0)
      throw new Error(`tasks[${i}]: invalid project_id`)
    if (typeof t.title !== 'string' || !(t.title as string).trim())
      throw new Error(`tasks[${i}]: title must be a non-empty string`)
    if (!validTaskStatus.has(t.status as string))
      throw new Error(`tasks[${i}]: invalid status "${t.status}"`)
  }

  // All destructive operations run inside a transaction.
  // If anything fails after the deletes, the database rolls back
  // to its original state — no data is lost.
  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    // Clear existing data (CASCADE deletes handle related records)
    await exec(sqlite, db, 'DELETE FROM dropdown_options')
    await exec(sqlite, db, 'DELETE FROM projects')

    // Restore dropdown options first (projects reference them)
    for (const opt of data.dropdownOptions) {
      await exec(sqlite, db,
        `INSERT INTO dropdown_options (id, type, label, sort_order, color) VALUES (?, ?, ?, ?, ?)`,
        [opt.id as number, opt.type as string, opt.label as string, opt.sort_order as number, (opt.color as string) ?? ''],
      )
    }

    // Restore projects
    for (const p of data.projects) {
      await exec(sqlite, db,
        `INSERT INTO projects
           (id, work_item, work_desc, rag_status, priority_id, latest_status,
            product_area_id, status_id, stakeholders, linked_jiras, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id as number, p.work_item as string, p.work_desc as string,
          p.rag_status as string, p.priority_id as number | null,
          p.latest_status as string, p.product_area_id as number | null,
          (p.status_id as number | null) ?? null,
          p.stakeholders as string, p.linked_jiras as string,
          p.created_at as string, p.updated_at as string,
        ],
      )
    }

    // Restore work log entries
    for (const e of data.workLogEntries) {
      await exec(sqlite, db,
        `INSERT INTO work_log_entries (id, project_id, note, created_at) VALUES (?, ?, ?, ?)`,
        [e.id as number, e.project_id as number, e.note as string, e.created_at as string],
      )
    }

    // Restore tasks
    for (const t of data.tasks) {
      await exec(sqlite, db,
        `INSERT INTO tasks
           (id, project_id, title, description, notes, status, owner,
            start_date, due_date, priority_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id as number, t.project_id as number, t.title as string,
          t.description as string, t.notes as string, t.status as string,
          t.owner as string, t.start_date as string | null,
          t.due_date as string | null, t.priority_id as number | null,
          t.created_at as string, t.updated_at as string,
        ],
      )
    }

    // Rebuild FTS index from scratch
    await exec(sqlite, db, 'DELETE FROM fts_index')
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT
        work_item || ' ' || work_desc || ' ' || latest_status || ' ' || stakeholders,
        'project', id, id
      FROM projects
    `)
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT
        title || ' ' || description || ' ' || notes || ' ' || owner,
        'task', id, project_id
      FROM tasks
    `)
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT note, 'work_log', id, project_id FROM work_log_entries
    `)

    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }
  await persistToUserFolder()
}
