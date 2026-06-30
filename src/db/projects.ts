import { query, run, lastInsertId } from './index'
import type { Project, RagStatus, Stakeholder } from '@/types'


function parseTags(raw: string): string[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as string[]
    return []
  } catch {
    return []
  }
}

function stringifyTags(tags: string[]): string {
  return tags.length === 0 ? '' : JSON.stringify(tags)
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
    tags: parseTags(row.tags as string),
    dueDate: (row.due_date as string | null) ?? null,
    isArchived: !!(row.is_archived as number),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Returns all non-archived projects, newest first */
export async function getAllProjects(): Promise<Project[]> {
  const rows = await query(`SELECT * FROM projects WHERE is_archived = 0 ORDER BY updated_at DESC`)
  return rows.map(rowToProject)
}

/** Returns every project regardless of archive status — used for lookups that need the full set */
export async function getAllProjectsIncludingArchived(): Promise<Project[]> {
  const rows = await query(`SELECT * FROM projects ORDER BY updated_at DESC`)
  return rows.map(rowToProject)
}

/** Returns all archived projects, newest first */
export async function getArchivedProjects(): Promise<Project[]> {
  const rows = await query(`SELECT * FROM projects WHERE is_archived = 1 ORDER BY updated_at DESC`)
  return rows.map(rowToProject)
}

/** Marks a project as archived (independent of its status label). */
export async function archiveProject(id: number): Promise<void> {
  await run(`UPDATE projects SET is_archived = 1 WHERE id = ?`, [id])
}

/** Restores an archived project back to active. */
export async function restoreProject(id: number): Promise<void> {
  await run(`UPDATE projects SET is_archived = 0 WHERE id = ?`, [id])
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
  tags?: string[]
  dueDate?: string | null
}

export async function createProject(input: CreateProjectInput): Promise<number> {
  await run(
    `INSERT INTO projects
      (work_item, work_desc, rag_status, priority_id, latest_status, product_area_id, status_id, stakeholders, tags, due_date)
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
      stringifyTags(input.tags ?? []),
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
      tags            = ?,
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
      stringifyTags(input.tags !== undefined ? input.tags : current.tags),
      input.dueDate !== undefined ? input.dueDate : current.dueDate,
      input.id,
    ],
  )
}

export async function deleteProject(id: number): Promise<void> {
  await run(`DELETE FROM projects WHERE id = ?`, [id])
}

/** Renames a stakeholder across all projects. */
export async function renameStakeholder(oldName: string, newName: string): Promise<void> {
  const rows = await query(`SELECT id, stakeholders FROM projects WHERE stakeholders IS NOT NULL AND stakeholders != ''`)
  for (const row of rows) {
    const parsed = parseStakeholders(row.stakeholders as string)
    const updated = parsed.map(s => s.name === oldName ? { ...s, name: newName } : s)
    if (updated.some((s, i) => s.name !== parsed[i].name)) {
      await run(`UPDATE projects SET stakeholders = ? WHERE id = ?`, [stringifyStakeholders(updated), row.id as number])
    }
  }
}

/** Removes a stakeholder from all projects. */
export async function deleteStakeholder(name: string): Promise<void> {
  const rows = await query(`SELECT id, stakeholders FROM projects WHERE stakeholders IS NOT NULL AND stakeholders != ''`)
  for (const row of rows) {
    const parsed = parseStakeholders(row.stakeholders as string)
    const updated = parsed.filter(s => s.name !== name)
    if (updated.length !== parsed.length) {
      await run(`UPDATE projects SET stakeholders = ? WHERE id = ?`, [stringifyStakeholders(updated), row.id as number])
    }
  }
}

/** Returns a sorted, deduplicated list of all stakeholder names — from projects and the contacts table. */
export async function getAllStakeholderNames(): Promise<string[]> {
  const [projectRows, contactRows] = await Promise.all([
    query(`SELECT stakeholders FROM projects WHERE stakeholders != '' AND stakeholders IS NOT NULL`),
    query(`SELECT name FROM contacts ORDER BY name COLLATE NOCASE ASC`),
  ])
  const nameSet = new Set<string>()
  for (const row of projectRows) {
    const parsed = parseStakeholders(row.stakeholders as string)
    for (const s of parsed) if (s.name.trim()) nameSet.add(s.name.trim())
  }
  for (const row of contactRows) {
    const name = (row.name as string).trim()
    if (name) nameSet.add(name)
  }
  return [...nameSet].sort((a, b) => a.localeCompare(b))
}

/** Returns a sorted, deduplicated list of all tag names across projects, tasks, and contacts — used for autocomplete. */
export async function getAllTagNames(): Promise<string[]> {
  const [projectRows, taskRows, contactRows] = await Promise.all([
    query(`SELECT tags FROM projects WHERE tags != '' AND tags IS NOT NULL`),
    query(`SELECT tags FROM tasks WHERE tags != '' AND tags IS NOT NULL`),
    query(`SELECT tags FROM contacts WHERE tags != '' AND tags IS NOT NULL`),
  ])
  const tagSet = new Set<string>()
  for (const row of [...projectRows, ...taskRows, ...contactRows]) {
    for (const tag of parseTags(row.tags as string)) {
      const trimmed = tag.trim()
      if (trimmed) tagSet.add(trimmed)
    }
  }
  return [...tagSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
