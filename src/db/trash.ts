/**
 * Trash — deleted records are kept for TRASH_DAYS and can be restored.
 *
 * Deleting a project, task, work log entry, notebook page or contact moves a
 * full copy of the row into the `trash` table (as JSON) and then deletes it, in
 * one transaction. A project carries its tasks and work log entries with it,
 * since deleting a project cascades to them. Restoring re-inserts the rows with
 * their original ids — every table uses AUTOINCREMENT, so an id is never handed
 * to a different record in the meantime. Items older than TRASH_DAYS are purged
 * at startup.
 *
 * The trash table is user data and part of every backup.
 */

import { exec, getDb, persistToUserFolder, query, type SQLiteCompatibleType } from './index'

export const TRASH_DAYS = 30

export type TrashItemType = 'project' | 'task' | 'worklog' | 'note' | 'contact'

const TABLE: Record<TrashItemType, string> = {
  project: 'projects',
  task: 'tasks',
  worklog: 'work_log_entries',
  note: 'notebook_pages',
  contact: 'contacts',
}

type Row = Record<string, SQLiteCompatibleType>

interface TrashPayload {
  row: Row
  /** A project's tasks and work log entries, deleted along with it. */
  tasks?: Row[]
  workLogEntries?: Row[]
}

export interface TrashItem {
  id: number
  itemType: TrashItemType
  itemId: number
  title: string
  /** Extra context: a task's or log entry's project, a project's task/entry counts. */
  detail: string
  /** UTC timestamp. */
  deletedAt: string
}

/** Window event fired when the trash changes, so open lists refresh. */
export const TRASH_CHANGED_EVENT = 'myworker:trash-changed'

function titleOf(type: TrashItemType, row: Row): string {
  switch (type) {
    case 'project': return (row.work_item as string) || 'Untitled project'
    case 'task': return (row.title as string) || 'Untitled task'
    case 'worklog': return ((row.note as string) ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Empty entry'
    case 'note': return (row.title as string) || 'Untitled'
    case 'contact': return (row.name as string) || 'Unnamed contact'
  }
}

/**
 * Move one record (and, for a project, its tasks and work log entries) to the
 * trash and delete it, atomically. Used by every delete function in the db layer.
 */
export async function moveToTrash(type: TrashItemType, id: number): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    const rows = await exec(sqlite, db, `SELECT * FROM ${TABLE[type]} WHERE id = ?`, [id])
    if (rows.length === 0) {
      await exec(sqlite, db, 'COMMIT')
      return
    }
    const payload: TrashPayload = { row: rows[0] }
    if (type === 'project') {
      payload.tasks = await exec(sqlite, db, `SELECT * FROM tasks WHERE project_id = ?`, [id])
      payload.workLogEntries = await exec(sqlite, db, `SELECT * FROM work_log_entries WHERE project_id = ?`, [id])
    }
    await exec(sqlite, db,
      `INSERT INTO trash (item_type, item_id, title, payload) VALUES (?, ?, ?, ?)`,
      [type, id, titleOf(type, rows[0]), JSON.stringify(payload)],
    )
    await exec(sqlite, db, `DELETE FROM ${TABLE[type]} WHERE id = ?`, [id])
    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }
  await persistToUserFolder()
  window.dispatchEvent(new Event(TRASH_CHANGED_EVENT))
}

/** Items in the trash, most recently deleted first. */
export async function getTrashItems(): Promise<TrashItem[]> {
  const rows = await query(`SELECT id, item_type, item_id, title, payload, deleted_at FROM trash ORDER BY deleted_at DESC, id DESC`)
  // Project names for context on tasks and log entries
  const projectNames = new Map<number, string>()
  for (const r of await query(`SELECT id, work_item FROM projects`)) projectNames.set(r.id as number, r.work_item as string)
  for (const r of rows) {
    if (r.item_type === 'project') {
      const p = JSON.parse(r.payload as string) as TrashPayload
      projectNames.set(r.item_id as number, (p.row.work_item as string) ?? '')
    }
  }

  return rows.map(r => {
    const type = r.item_type as TrashItemType
    const payload = JSON.parse(r.payload as string) as TrashPayload
    let detail = ''
    if (type === 'project') {
      const t = payload.tasks?.length ?? 0
      const w = payload.workLogEntries?.length ?? 0
      detail = `${t} task${t === 1 ? '' : 's'} · ${w} log entr${w === 1 ? 'y' : 'ies'}`
    } else if (type === 'task' || type === 'worklog') {
      const pid = payload.row.project_id as number | null
      detail = pid ? (projectNames.get(pid) ?? 'Deleted project') : 'No project'
    }
    return {
      id: r.id as number,
      itemType: type,
      itemId: r.item_id as number,
      title: r.title as string,
      detail,
      deletedAt: r.deleted_at as string,
    }
  })
}

async function insertRow(table: string, row: Row): Promise<void> {
  const { sqlite, db } = getDb()
  // Only columns that still exist — a migration since the delete may have
  // dropped or renamed one; any newly added column takes its default.
  const existing = new Set(
    (await exec(sqlite, db, `SELECT name FROM pragma_table_info('${table}')`)).map(c => c.name as string),
  )
  const cols = Object.keys(row).filter(c => existing.has(c))
  await exec(sqlite, db,
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map(c => row[c]),
  )
}

async function exists(table: string, id: SQLiteCompatibleType): Promise<boolean> {
  const { sqlite, db } = getDb()
  return (await exec(sqlite, db, `SELECT 1 FROM ${table} WHERE id = ?`, [id])).length > 0
}

/**
 * Put a trashed item back. Returns a note for the user when something had to
 * change (a task whose project is gone goes to the Inbox). Throws with a
 * readable message when it can't be restored yet (a log entry whose project is
 * still in the trash).
 */
export async function restoreFromTrash(trashId: number): Promise<string | null> {
  const rows = await query(`SELECT item_type, item_id, payload FROM trash WHERE id = ?`, [trashId])
  if (rows.length === 0) throw new Error('That item is no longer in the trash.')
  const type = rows[0].item_type as TrashItemType
  const payload = JSON.parse(rows[0].payload as string) as TrashPayload
  const row = { ...payload.row }
  let note: string | null = null

  if (type === 'worklog' && !(await exists('projects', row.project_id))) {
    throw new Error('This entry\'s project was deleted. Restore the project first.')
  }
  if (type === 'task' && row.project_id !== null && !(await exists('projects', row.project_id))) {
    row.project_id = null
    note = 'Its project no longer exists, so the task was restored to the Inbox.'
  }

  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    await insertRow(TABLE[type], row)
    for (const t of payload.tasks ?? []) await insertRow('tasks', t)
    for (const w of payload.workLogEntries ?? []) await insertRow('work_log_entries', w)
    await exec(sqlite, db, `DELETE FROM trash WHERE id = ?`, [trashId])
    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    if (err instanceof Error && /UNIQUE|constraint/i.test(err.message)) {
      throw new Error('A record with the same id already exists, so this item can\'t be restored.')
    }
    throw err
  }
  if (type === 'note') {
    // Re-index the restored page's [[links]] (dynamic import: notebook.ts imports this module)
    const { rebuildLinks } = await import('./notebook')
    await rebuildLinks(row.id as number, (row.body as string) ?? '')
  }
  await persistToUserFolder()
  window.dispatchEvent(new Event(TRASH_CHANGED_EVENT))
  return note
}

/** Permanently delete one item from the trash. */
export async function deleteFromTrash(trashId: number): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, `DELETE FROM trash WHERE id = ?`, [trashId])
  await persistToUserFolder()
  window.dispatchEvent(new Event(TRASH_CHANGED_EVENT))
}

/** Permanently delete everything in the trash. */
export async function emptyTrash(): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, `DELETE FROM trash`)
  await persistToUserFolder()
  window.dispatchEvent(new Event(TRASH_CHANGED_EVENT))
}

/** Remove items deleted more than TRASH_DAYS ago. Run at startup. */
export async function purgeExpiredTrash(): Promise<void> {
  const { sqlite, db } = getDb()
  const expired = await exec(sqlite, db,
    `SELECT COUNT(*) AS n FROM trash WHERE deleted_at < datetime('now', ?)`, [`-${TRASH_DAYS} days`])
  if (Number(expired[0]?.n ?? 0) === 0) return
  await exec(sqlite, db, `DELETE FROM trash WHERE deleted_at < datetime('now', ?)`, [`-${TRASH_DAYS} days`])
  await persistToUserFolder()
}
