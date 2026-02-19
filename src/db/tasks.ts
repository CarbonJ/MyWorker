import { query, run, lastInsertId } from './index'
import type { Task, TaskStatus } from '@/types'

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    projectId: row.project_id as number,
    title: row.title as string,
    description: row.description as string,
    notes: row.notes as string,
    status: row.status as TaskStatus,
    owner: row.owner as string,
    startDate: row.start_date as string | null,
    dueDate: row.due_date as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getTasksByProject(projectId: number): Promise<Task[]> {
  const rows = await query(
    `SELECT * FROM tasks WHERE project_id = ? ORDER BY due_date ASC, created_at ASC`,
    [projectId],
  )
  return rows.map(rowToTask)
}

export async function getOpenTasksByProject(projectId: number): Promise<Task[]> {
  const rows = await query(
    `SELECT * FROM tasks
     WHERE project_id = ? AND status IN ('open', 'in_progress')
     ORDER BY due_date ASC, created_at ASC`,
    [projectId],
  )
  return rows.map(rowToTask)
}

/** Returns all tasks that are overdue or due today, across all projects */
export async function getDueSoonTasks(): Promise<Task[]> {
  const rows = await query(
    `SELECT * FROM tasks
     WHERE status != 'done'
       AND due_date IS NOT NULL
       AND due_date <= date('now')
     ORDER BY due_date ASC`,
  )
  return rows.map(rowToTask)
}

export interface CreateTaskInput {
  projectId: number
  title: string
  description?: string
  notes?: string
  status?: TaskStatus
  owner?: string
  startDate?: string | null
  dueDate?: string | null
}

export async function createTask(input: CreateTaskInput): Promise<number> {
  await run(
    `INSERT INTO tasks
      (project_id, title, description, notes, status, owner, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId,
      input.title,
      input.description ?? '',
      input.notes ?? '',
      input.status ?? 'open',
      input.owner ?? '',
      input.startDate ?? null,
      input.dueDate ?? null,
    ],
  )
  return await lastInsertId()
}

export interface UpdateTaskInput extends Partial<Omit<CreateTaskInput, 'projectId'>> {
  id: number
}

export async function updateTask(input: UpdateTaskInput): Promise<void> {
  const rows = await query(`SELECT * FROM tasks WHERE id = ?`, [input.id])
  if (rows.length === 0) throw new Error(`Task ${input.id} not found`)
  const current = rowToTask(rows[0])

  await run(
    `UPDATE tasks SET
      title       = ?,
      description = ?,
      notes       = ?,
      status      = ?,
      owner       = ?,
      start_date  = ?,
      due_date    = ?
     WHERE id = ?`,
    [
      input.title ?? current.title,
      input.description ?? current.description,
      input.notes ?? current.notes,
      input.status ?? current.status,
      input.owner ?? current.owner,
      input.startDate !== undefined ? input.startDate : current.startDate,
      input.dueDate !== undefined ? input.dueDate : current.dueDate,
      input.id,
    ],
  )
}

export async function deleteTask(id: number): Promise<void> {
  await run(`DELETE FROM tasks WHERE id = ?`, [id])
}
