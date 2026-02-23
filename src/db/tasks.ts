import { query, run, lastInsertId } from './index'
import type { Task, TaskStatus } from '@/types'

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    projectId: row.project_id as number | null,
    productAreaId: (row.product_area_id as number | null) ?? null,
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
    preArchiveStatus: (row.pre_archive_status as TaskStatus | null) ?? null,
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
  /** Direct area — only used when projectId is null (area tasks). */
  productAreaId?: number | null
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
      (project_id, product_area_id, title, description, notes, status, priority_id, start_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId ?? null,
      // Only persist direct area when there is no project; otherwise it is inherited from the project
      input.projectId ? null : (input.productAreaId ?? null),
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

  const newProjectId = input.projectId !== undefined ? input.projectId : current.projectId
  const newProductAreaId = newProjectId
    ? null  // area is inherited from the project; clear any direct value
    : (input.productAreaId !== undefined ? input.productAreaId : current.productAreaId)

  await run(
    `UPDATE tasks SET
      project_id      = ?,
      product_area_id = ?,
      title           = ?,
      description     = ?,
      notes           = ?,
      status          = ?,
      priority_id     = ?,
      start_date      = ?,
      due_date        = ?
     WHERE id = ?`,
    [
      newProjectId,
      newProductAreaId,
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

/** When archiving a project: bulk-mark all open/in_progress tasks as done,
 *  saving their current status so they can be restored on reopen. */
export async function archiveTasksByProject(projectId: number): Promise<void> {
  await run(
    `UPDATE tasks
     SET pre_archive_status = status,
         status = 'done'
     WHERE project_id = ?
       AND status IN ('open', 'in_progress')`,
    [projectId],
  )
}

/** When reopening a project: restore tasks that were auto-closed by archiving
 *  back to their pre-archive status, then clear the snapshot. */
export async function restoreTasksByProject(projectId: number): Promise<void> {
  await run(
    `UPDATE tasks
     SET status = pre_archive_status,
         pre_archive_status = NULL
     WHERE project_id = ?
       AND pre_archive_status IS NOT NULL`,
    [projectId],
  )
}
