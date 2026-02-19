import { query, run, lastInsertId } from './index'
import type { Task, TaskStatus } from '@/types'

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    projectId: row.project_id as number | null,
    title: row.title as string,
    description: row.description as string,
    notes: row.notes as string,
    status: row.status as TaskStatus,
    priorityId: row.priority_id as number | null,
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
  projectId?: number | null
  title: string
  description?: string
  notes?: string
  status?: TaskStatus
  priorityId?: number | null
  startDate?: string | null
  dueDate?: string | null
}

export async function getAllTasks(): Promise<Task[]> {
  const rows = await query(
    `SELECT * FROM tasks
     ORDER BY
       CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
       due_date ASC,
       created_at ASC`,
  )
  return rows.map(rowToTask)
}

export async function createTask(input: CreateTaskInput): Promise<number> {
  await run(
    `INSERT INTO tasks
      (project_id, title, description, notes, status, priority_id, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId ?? null,
      input.title,
      input.description ?? '',
      input.notes ?? '',
      input.status ?? 'open',
      input.priorityId ?? null,
      input.startDate ?? null,
      input.dueDate ?? null,
    ],
  )
  return await lastInsertId()
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  id: number
}

export async function updateTask(input: UpdateTaskInput): Promise<void> {
  const rows = await query(`SELECT * FROM tasks WHERE id = ?`, [input.id])
  if (rows.length === 0) throw new Error(`Task ${input.id} not found`)
  const current = rowToTask(rows[0])

  await run(
    `UPDATE tasks SET
      project_id  = ?,
      title       = ?,
      description = ?,
      notes       = ?,
      status      = ?,
      priority_id = ?,
      start_date  = ?,
      due_date    = ?
     WHERE id = ?`,
    [
      input.projectId !== undefined ? input.projectId : current.projectId,
      input.title ?? current.title,
      input.description ?? current.description,
      input.notes ?? current.notes,
      input.status ?? current.status,
      input.priorityId !== undefined ? input.priorityId : current.priorityId,
      input.startDate !== undefined ? input.startDate : current.startDate,
      input.dueDate !== undefined ? input.dueDate : current.dueDate,
      input.id,
    ],
  )
}

export async function deleteTask(id: number): Promise<void> {
  await run(`DELETE FROM tasks WHERE id = ?`, [id])
}
