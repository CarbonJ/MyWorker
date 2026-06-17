import { query, run, lastInsertId } from './index'
import type { WorkLogEntry } from '@/types'

function rowToEntry(row: Record<string, unknown>): WorkLogEntry {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
  }
}

export async function getAllWorkLogEntries(): Promise<WorkLogEntry[]> {
  const rows = await query(
    `SELECT * FROM work_log_entries ORDER BY created_at DESC`,
  )
  return rows.map(rowToEntry)
}

/** Returns the latest work log entry for each project (one row per project). */
export async function getLatestWorkLogPerProject(): Promise<WorkLogEntry[]> {
  const rows = await query(`
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) AS rn
      FROM work_log_entries
      WHERE note NOT LIKE '✓ Completed%'
    )
    SELECT id, project_id, note, created_at FROM ranked WHERE rn = 1
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

export async function addWorkLogEntry(projectId: number, note: string): Promise<number> {
  await run(
    `INSERT INTO work_log_entries (project_id, note) VALUES (?, ?)`,
    [projectId, note],
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
    `SELECT wle.id, wle.project_id, wle.note, wle.created_at, p.work_item AS project_name,
            p.rag_status, p.latest_status
     FROM work_log_entries wle
     JOIN projects p ON p.id = wle.project_id
     WHERE DATE(wle.created_at) BETWEEN ? AND ?
     ORDER BY p.work_item ASC, wle.created_at ASC`,
    [startDate, endDate],
  )
  return rows.map(row => ({
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
    projectName: row.project_name as string,
    ragStatus: row.rag_status as string,
    latestStatus: row.latest_status as string,
  }))
}

/** Returns all work log entries across all projects for a given YYYY-MM-DD date. */
export async function getWorkLogByDate(date: string): Promise<WorkLogEntryWithProject[]> {
  const rows = await query(
    `SELECT wle.id, wle.project_id, wle.note, wle.created_at, p.work_item AS project_name
     FROM work_log_entries wle
     JOIN projects p ON p.id = wle.project_id
     WHERE DATE(wle.created_at) = ?
     ORDER BY p.work_item ASC, wle.created_at DESC`,
    [date],
  )
  return rows.map(row => ({
    id: row.id as number,
    projectId: row.project_id as number,
    note: row.note as string,
    createdAt: row.created_at as string,
    projectName: row.project_name as string,
  }))
}
