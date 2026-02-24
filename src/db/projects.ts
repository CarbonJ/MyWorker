import { query, run, lastInsertId } from './index'
import type { Project, RagStatus, JiraLink, Stakeholder } from '@/types'

// Subquery: finds the id(s) of any project_status option labelled "done"
const DONE_SUBQ = `SELECT id FROM dropdown_options WHERE type='project_status' AND lower(label)='done'`

function parseLinkedJiras(raw: string): JiraLink[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as JiraLink[]
    return []
  } catch {
    return []
  }
}

function stringifyLinkedJiras(jiras: JiraLink[]): string {
  return jiras.length === 0 ? '' : JSON.stringify(jiras)
}

function parseStakeholders(raw: string): Stakeholder[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as Stakeholder[]
    return []
  } catch {
    // Legacy: plain comma-separated string — migrate on read
    return raw.split(',').map(n => ({ name: n.trim() })).filter(s => s.name)
  }
}

function stringifyStakeholders(stakeholders: Stakeholder[]): string {
  return stakeholders.length === 0 ? '' : JSON.stringify(stakeholders)
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as number,
    workItem: row.work_item as string,
    workDescription: row.work_desc as string,
    ragStatus: row.rag_status as RagStatus,
    priorityId: row.priority_id as number | null,
    latestStatus: row.latest_status as string,
    productAreaId: row.product_area_id as number | null,
    statusId: row.status_id as number | null,
    stakeholders: parseStakeholders(row.stakeholders as string),
    linkedJiras: parseLinkedJiras(row.linked_jiras as string),
    dueDate: (row.due_date as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Returns all non-archived (non-Done) projects, newest first */
export async function getAllProjects(): Promise<Project[]> {
  const rows = await query(`
    SELECT * FROM projects
    WHERE status_id IS NULL OR status_id NOT IN (${DONE_SUBQ})
    ORDER BY updated_at DESC
  `)
  return rows.map(rowToProject)
}

/** Returns every project regardless of status — used for lookups that need the full set */
export async function getAllProjectsIncludingArchived(): Promise<Project[]> {
  const rows = await query(`SELECT * FROM projects ORDER BY updated_at DESC`)
  return rows.map(rowToProject)
}

/** Returns all archived (Done) projects, newest first */
export async function getArchivedProjects(): Promise<Project[]> {
  const rows = await query(`
    SELECT * FROM projects
    WHERE status_id IN (${DONE_SUBQ})
    ORDER BY updated_at DESC
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
  statusId?: number | null
  stakeholders?: Stakeholder[]
  linkedJiras?: JiraLink[]
  dueDate?: string | null
}

export async function createProject(input: CreateProjectInput): Promise<number> {
  await run(
    `INSERT INTO projects
      (work_item, work_desc, rag_status, priority_id, latest_status, product_area_id, status_id, stakeholders, linked_jiras, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.workItem,
      input.workDescription ?? '',
      input.ragStatus ?? 'Green',
      input.priorityId ?? null,
      input.latestStatus ?? '',
      input.productAreaId ?? null,
      input.statusId ?? null,
      stringifyStakeholders(input.stakeholders ?? []),
      stringifyLinkedJiras(input.linkedJiras ?? []),
      input.dueDate ?? null,
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
      status_id       = ?,
      stakeholders    = ?,
      linked_jiras    = ?,
      due_date        = ?
     WHERE id = ?`,
    [
      input.workItem ?? current.workItem,
      input.workDescription ?? current.workDescription,
      input.ragStatus ?? current.ragStatus,
      input.priorityId !== undefined ? input.priorityId : current.priorityId,
      input.latestStatus ?? current.latestStatus,
      input.productAreaId !== undefined ? input.productAreaId : current.productAreaId,
      input.statusId !== undefined ? input.statusId : current.statusId,
      stringifyStakeholders(input.stakeholders !== undefined ? input.stakeholders : current.stakeholders),
      input.linkedJiras !== undefined
        ? stringifyLinkedJiras(input.linkedJiras)
        : stringifyLinkedJiras(current.linkedJiras),
      input.dueDate !== undefined ? input.dueDate : current.dueDate,
      input.id,
    ],
  )
}

export async function deleteProject(id: number): Promise<void> {
  await run(`DELETE FROM projects WHERE id = ?`, [id])
}

/** Returns a sorted list of all unique stakeholder names across all projects — used for autocomplete. */
export async function getAllStakeholderNames(): Promise<string[]> {
  const rows = await query(`SELECT stakeholders FROM projects WHERE stakeholders != '' AND stakeholders IS NOT NULL`)
  const nameSet = new Set<string>()
  for (const row of rows) {
    const parsed = parseStakeholders(row.stakeholders as string)
    for (const s of parsed) if (s.name.trim()) nameSet.add(s.name.trim())
  }
  return [...nameSet].sort((a, b) => a.localeCompare(b))
}
