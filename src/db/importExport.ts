/**
 * Import / Export
 *
 * Export: serialises all data to a JSON file and triggers a browser download.
 * Import: reads a previously exported JSON file and restores all data.
 */

import { query, run } from './index'

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

  if (!data.version || !data.projects) {
    throw new Error('Invalid backup file format.')
  }

  // Clear existing data (CASCADE deletes handle related records)
  await run('DELETE FROM dropdown_options')
  await run('DELETE FROM projects')

  // Restore dropdown options first (projects reference them)
  for (const opt of data.dropdownOptions) {
    await run(
      `INSERT INTO dropdown_options (id, type, label, sort_order, color) VALUES (?, ?, ?, ?, ?)`,
      [opt.id as number, opt.type as string, opt.label as string, opt.sort_order as number, (opt.color as string) ?? ''],
    )
  }

  // Restore projects
  for (const p of data.projects) {
    await run(
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
    await run(
      `INSERT INTO work_log_entries (id, project_id, note, created_at) VALUES (?, ?, ?, ?)`,
      [e.id as number, e.project_id as number, e.note as string, e.created_at as string],
    )
  }

  // Restore tasks
  for (const t of data.tasks) {
    await run(
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
  await run('DELETE FROM fts_index')
  await run(`
    INSERT INTO fts_index (content, source_type, source_id, project_id)
    SELECT
      work_item || ' ' || work_desc || ' ' || latest_status || ' ' || stakeholders,
      'project', id, id
    FROM projects
  `)
  await run(`
    INSERT INTO fts_index (content, source_type, source_id, project_id)
    SELECT
      title || ' ' || description || ' ' || notes || ' ' || owner,
      'task', id, project_id
    FROM tasks
  `)
  await run(`
    INSERT INTO fts_index (content, source_type, source_id, project_id)
    SELECT note, 'work_log', id, project_id FROM work_log_entries
  `)
}
