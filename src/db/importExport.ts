/**
 * Import / Export
 *
 * Export: serialises all user-authored data to a JSON file (format version 2)
 * and triggers a browser download. Which tables are captured is driven by the
 * registry in backupSchema.ts — see that file for how coverage is enforced.
 * Derived data (fts_index, notebook_links, app_metadata) is regenerated on
 * import instead of being exported.
 *
 * Import accepts format versions 1 and 2:
 *   - v1 (pre-notebook backups): restores projects, work log, tasks and dropdown
 *     options. Contacts, notebook pages and saved views already in the database
 *     are left untouched, since a v1 file carries no data for them.
 *   - v2: full replace of every exported table, plus myworker:* localStorage
 *     preferences when present.
 *
 * Import sequencing (order matters):
 *   1. Parse JSON and validate all records (backupValidation.ts) — no data is
 *      touched if anything is invalid.
 *   2. Open a database transaction (BEGIN).
 *   3. Delete existing data and restore from the backup file.
 *   4. Rebuild the FTS index from scratch — the index is derived data and is not
 *      stored in the backup file, so it must be regenerated after every import.
 *   5. Commit, rebuild notebook links, restore localStorage prefs, and persist
 *      to the OneDrive folder.
 *
 * The transaction guarantees that if anything fails after step 2, the database
 * automatically rolls back to its original state. The user's data is never
 * partially replaced.
 */

import { exec, getDb, persistToUserFolder, snapshotUserData } from './index'
import { rebuildAllLinks } from './notebook'
import { validateBackupData } from './backupValidation'
import { localToday } from '@/lib/utils'

export async function exportToJson(): Promise<void> {
  const data = {
    ...(await snapshotUserData()),
    exportedAt: new Date().toISOString(),
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `myworker-backup-${localToday()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importFromJson(file: File): Promise<void> {
  const text = await file.text()
  await restoreFromData(JSON.parse(text))
}

/**
 * Validate and restore a parsed backup object into the database.
 * Also used by the corruption-recovery path in db/index.ts, which reads the
 * automatic OneDrive backup (myworker-data.json) instead of an uploaded file.
 */
export async function restoreFromData(raw: unknown): Promise<void> {
  const data = validateBackupData(raw)

  // All destructive operations run inside a transaction.
  // If anything fails after the deletes, the database rolls back
  // to its original state — no data is lost.
  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    // Clear existing data explicitly (CASCADE alone misses project_id=null tasks).
    // Tables introduced in format v2 are only cleared when the backup actually
    // carries them, so importing an old v1 file never destroys newer data.
    await exec(sqlite, db, 'DELETE FROM dropdown_options')
    await exec(sqlite, db, 'DELETE FROM tasks')
    await exec(sqlite, db, 'DELETE FROM projects')
    if (data.contacts) await exec(sqlite, db, 'DELETE FROM contacts')
    if (data.notebookPages) await exec(sqlite, db, 'DELETE FROM notebook_pages')
    if (data.savedViews) await exec(sqlite, db, 'DELETE FROM saved_views')

    // Restore dropdown options first (projects reference them)
    for (const opt of data.dropdownOptions ?? []) {
      await exec(sqlite, db,
        `INSERT INTO dropdown_options (id, type, label, sort_order, color) VALUES (?, ?, ?, ?, ?)`,
        [opt.id as number, opt.type as string, opt.label as string, opt.sort_order as number, (opt.color as string) ?? ''],
      )
    }

    // Restore projects
    for (const p of data.projects) {
      await exec(sqlite, db,
        `INSERT INTO projects
           (id, work_item, work_desc, rag_status, priority_id, latest_status,
            product_area_id, status_id, due_date, is_archived, stakeholders, linked_jiras, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id as number, p.work_item as string, p.work_desc as string,
          p.rag_status as string, p.priority_id as number | null,
          p.latest_status as string, p.product_area_id as number | null,
          (p.status_id as number | null) ?? null,
          (p.due_date as string | null) ?? null,
          (p.is_archived as number) ?? 0,
          p.stakeholders as string, (p.linked_jiras as string | undefined) ?? '',
          (p.tags as string | undefined) ?? '',
          p.created_at as string, p.updated_at as string,
        ],
      )
    }

    // Restore work log entries (is_system defaults to 0 for pre-v3.3.12 backups)
    for (const e of data.workLogEntries ?? []) {
      await exec(sqlite, db,
        `INSERT INTO work_log_entries (id, project_id, note, is_system, created_at) VALUES (?, ?, ?, ?, ?)`,
        [e.id as number, e.project_id as number, e.note as string, (e.is_system as number) ?? 0, e.created_at as string],
      )
    }

    // Backups written before the is_system flag existed carry no such field —
    // re-apply the migration v21 back-fill so completion entries stay flagged.
    // Skipped when any entry has the field, so user notes in newer backups
    // that happen to start with "✓ Completed" are never mis-flagged.
    const hasSystemFlag = (data.workLogEntries ?? []).some(e => e.is_system !== undefined)
    if (!hasSystemFlag) {
      await exec(sqlite, db,
        `UPDATE work_log_entries SET is_system = 1 WHERE note LIKE '✓ Completed%'`)
    }

    // Restore tasks
    for (const t of data.tasks ?? []) {
      await exec(sqlite, db,
        `INSERT INTO tasks
           (id, project_id, product_area_id, title, description, notes, status, owner,
            start_date, due_date, priority_id, is_recurring, tags, pre_archive_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id as number, (t.project_id as number | null) ?? null,
          (t.product_area_id as number | null) ?? null,
          t.title as string, t.description as string, t.notes as string,
          t.status as string, (t.owner as string | undefined) ?? '',
          t.start_date as string | null, t.due_date as string | null,
          t.priority_id as number | null,
          t.is_recurring ? 1 : 0,
          (t.tags as string | undefined) ?? '',
          (t.pre_archive_status as string | null) ?? null,
          t.created_at as string, t.updated_at as string,
        ],
      )
    }

    // Restore contacts (v2)
    for (const c of data.contacts ?? []) {
      await exec(sqlite, db,
        `INSERT INTO contacts (id, name, role, group_name, notes, tags, whos_who, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [
          c.id as number, c.name as string,
          (c.role as string) ?? '', (c.group_name as string) ?? '',
          (c.notes as string) ?? '', (c.tags as string) ?? '',
          (c.whos_who as string) ?? '',
          (c.created_at as string | null) ?? null,
          (c.updated_at as string | null) ?? null,
        ],
      )
    }

    // Restore notebook pages (v2). notebook_links are derived and rebuilt below.
    for (const n of data.notebookPages ?? []) {
      await exec(sqlite, db,
        `INSERT INTO notebook_pages (id, title, body, starred, created_at, updated_at)
         VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        [
          n.id as number, n.title as string, n.body as string,
          (n.starred as number) ?? 0,
          (n.created_at as string | null) ?? null,
          (n.updated_at as string | null) ?? null,
        ],
      )
    }

    // Restore saved views (v2)
    for (const v of data.savedViews ?? []) {
      await exec(sqlite, db,
        `INSERT INTO saved_views (id, page, name, data, created_at)
         VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        [
          (v.id as number | null) ?? null,
          v.page as string, v.name as string, v.data as string,
          (v.created_at as string | null) ?? null,
        ],
      )
    }

    // Pre-v2 backup: clear the one-time seed flag so the next startup re-derives
    // contact names from the restored projects' stakeholder lists.
    if (!data.contacts) {
      await exec(sqlite, db,
        `DELETE FROM app_metadata WHERE key = 'contacts_seeded_from_stakeholders'`)
    }

    // Rebuild FTS index from scratch. Content expressions must match the
    // fts_* triggers in migrations.ts (including tags — added in migration 13).
    await exec(sqlite, db, 'DELETE FROM fts_index')
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT
        work_item || ' ' || work_desc || ' ' || latest_status || ' ' || stakeholders || ' ' || tags,
        'project', id, id
      FROM projects
    `)
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT
        title || ' ' || description || ' ' || notes || ' ' || owner || ' ' || tags,
        'task', id, project_id
      FROM tasks
    `)
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT note, 'work_log', id, project_id FROM work_log_entries
    `)
    await exec(sqlite, db, `
      INSERT INTO fts_index (content, source_type, source_id, project_id)
      SELECT title || ' ' || body, 'notebook', id, 0 FROM notebook_pages
    `)

    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }

  // Restore UI preferences (localStorage is not transactional — applied only
  // after the database restore has committed successfully).
  if (data.localPrefs) {
    for (const [key, value] of Object.entries(data.localPrefs)) {
      if (key.startsWith('myworker:') && typeof value === 'string') {
        localStorage.setItem(key, value)
      }
    }
  }

  // Regenerate notebook_links from the (possibly restored) note bodies.
  await rebuildAllLinks()
  await persistToUserFolder()
}
