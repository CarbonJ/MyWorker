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
  return lastInsertId()
}

export async function deleteWorkLogEntry(id: number): Promise<void> {
  await run(`DELETE FROM work_log_entries WHERE id = ?`, [id])
}
