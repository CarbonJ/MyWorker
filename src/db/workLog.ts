import { query, run, lastInsertId } from './index'
import type { WorkLogEntry } from '@/types'

function rowToEntry(row: Record<string, unknown>): WorkLogEntry {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
    isSystem: !!(row.is_system as number),
  }
}

export async function getAllWorkLogEntries(): Promise<WorkLogEntry[]> {
  const rows = await query(
    `SELECT * FROM work_log_entries ORDER BY created_at DESC`,
  )
  return rows.map(rowToEntry)
}

/** Returns the latest user-written work log entry for each project (one row per project). */
export async function getLatestWorkLogPerProject(): Promise<WorkLogEntry[]> {
  const rows = await query(`
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) AS rn
      FROM work_log_entries
      WHERE is_system = 0
    )
    SELECT id, project_id, note, created_at, is_system FROM ranked WHERE rn = 1
  `)
  return rows.map(rowToEntry)
}

export async function getWorkLogByProject(projectId: number): Promise<WorkLogEntry[]> {
  const rows = await query(
    `SELECT * FROM work_log_entries
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    [projectId],
  )
  return rows.map(rowToEntry)
}

/** Add a work log entry. Pass isSystem = true for app-generated entries
 *  (task-completion lines) so they can be filtered without matching note text. */
export async function addWorkLogEntry(projectId: number, note: string, isSystem = false): Promise<number> {
  await run(
    `INSERT INTO work_log_entries (project_id, note, is_system) VALUES (?, ?, ?)`,
    [projectId, note, isSystem ? 1 : 0],
  )
  return await lastInsertId()
}

/** Update the note text of an existing entry. created_at is intentionally unchanged to preserve sort order. */
export async function updateWorkLogEntry(id: number, note: string): Promise<void> {
  await run(`UPDATE work_log_entries SET note = ? WHERE id = ?`, [note, id])
}

export async function deleteWorkLogEntry(id: number): Promise<void> {
  await run(`DELETE FROM work_log_entries WHERE id = ?`, [id])
}

export interface WorkLogEntryWithProject extends WorkLogEntry {
  projectName: string
  ragStatus?: string
  latestStatus?: string
}

/** Returns all work log entries across all projects for a date range (inclusive, YYYY-MM-DD). */
export async function getWorkLogByDateRange(startDate: string, endDate: string): Promise<WorkLogEntryWithProject[]> {
  const rows = await query(
    `SELECT wle.id, wle.project_id, wle.note, wle.created_at, wle.is_system, p.work_item AS project_name,
            p.rag_status, p.latest_status
     FROM work_log_entries wle
     JOIN projects p ON p.id = wle.project_id
     WHERE DATE(wle.created_at, 'localtime') BETWEEN ? AND ?
     ORDER BY p.work_item ASC, wle.created_at ASC`,
    [startDate, endDate],
  )
  return rows.map(row => ({
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
    isSystem: !!(row.is_system as number),
    projectName: row.project_name as string,
    ragStatus: row.rag_status as string,
    latestStatus: row.latest_status as string,
  }))
}

/** Returns all work log entries across all projects for a given YYYY-MM-DD date. */
export async function getWorkLogByDate(date: string): Promise<WorkLogEntryWithProject[]> {
  const rows = await query(
    `SELECT wle.id, wle.project_id, wle.note, wle.created_at, wle.is_system, p.work_item AS project_name
     FROM work_log_entries wle
     JOIN projects p ON p.id = wle.project_id
     WHERE DATE(wle.created_at, 'localtime') = ?
     ORDER BY p.work_item ASC, wle.created_at DESC`,
    [date],
  )
  return rows.map(row => ({
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
    isSystem: !!(row.is_system as number),
    projectName: row.project_name as string,
  }))
}
