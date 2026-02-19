import { query, run, lastInsertId } from './index'
import type { Project, RagStatus } from '@/types'

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    workItem: row.work_item as string,
    workDescription: row.work_desc as string,
    ragStatus: row.rag_status as RagStatus,
    priorityId: row.priority_id as number | null,
    latestStatus: row.latest_status as string,
    productAreaId: row.product_area_id as number | null,
    stakeholders: row.stakeholders as string,
    linkedJiras: row.linked_jiras as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await query(`
    SELECT * FROM projects ORDER BY updated_at DESC
  `)
  return rows.map(rowToProject)
}

export async function getProjectById(id: number): Promise<Project | null> {
  const rows = await query(`SELECT * FROM projects WHERE id = ?`, [id])
  return rows.length > 0 ? rowToProject(rows[0]) : null
}

export interface CreateProjectInput {
  workItem: string
  workDescription?: string
  ragStatus?: RagStatus
  priorityId?: number | null
  latestStatus?: string
  productAreaId?: number | null
  stakeholders?: string
  linkedJiras?: string
}

export async function createProject(input: CreateProjectInput): Promise<number> {
  await run(
    `INSERT INTO projects
      (work_item, work_desc, rag_status, priority_id, latest_status, product_area_id, stakeholders, linked_jiras)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.workItem,
      input.workDescription ?? '',
      input.ragStatus ?? 'Green',
      input.priorityId ?? null,
      input.latestStatus ?? '',
      input.productAreaId ?? null,
      input.stakeholders ?? '',
      input.linkedJiras ?? '',
    ],
  )
  return await lastInsertId()
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  id: number
}

export async function updateProject(input: UpdateProjectInput): Promise<void> {
  const current = await getProjectById(input.id)
  if (!current) throw new Error(`Project ${input.id} not found`)

  await run(
    `UPDATE projects SET
      work_item       = ?,
      work_desc       = ?,
      rag_status      = ?,
      priority_id     = ?,
      latest_status   = ?,
      product_area_id = ?,
      stakeholders    = ?,
      linked_jiras    = ?
     WHERE id = ?`,
    [
      input.workItem ?? current.workItem,
      input.workDescription ?? current.workDescription,
      input.ragStatus ?? current.ragStatus,
      input.priorityId !== undefined ? input.priorityId : current.priorityId,
      input.latestStatus ?? current.latestStatus,
      input.productAreaId !== undefined ? input.productAreaId : current.productAreaId,
      input.stakeholders ?? current.stakeholders,
      input.linkedJiras ?? current.linkedJiras,
      input.id,
    ],
  )
}

export async function deleteProject(id: number): Promise<void> {
  await run(`DELETE FROM projects WHERE id = ?`, [id])
}
