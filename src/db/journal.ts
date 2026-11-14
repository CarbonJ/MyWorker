/**
 * Daily Digest journal — one free-text entry per calendar day (YYYY-MM-DD).
 */

import { exec, getDb, persistToUserFolder, query, run } from './index'

/** localStorage prefix the journal used before it moved into the database. */
const LEGACY_PREFIX = 'myworker:digest-meetings:'

export async function getJournalEntry(date: string): Promise<string> {
  const rows = await query(`SELECT body FROM journal_entries WHERE entry_date = ?`, [date])
  return (rows[0]?.body as string | undefined) ?? ''
}

/** Save the day's entry; an emptied entry is removed rather than kept as a blank row. */
export async function saveJournalEntry(date: string, body: string): Promise<void> {
  if (!body.trim()) {
    await run(`DELETE FROM journal_entries WHERE entry_date = ?`, [date])
    return
  }
  await run(
    `INSERT INTO journal_entries (entry_date, body) VALUES (?, ?)
     ON CONFLICT(entry_date) DO UPDATE SET body = excluded.body`,
    [date, body],
  )
}

/**
 * Move journal text left in localStorage by older versions (or restored from an
 * older backup's prefs) into the table. A day that already has a database entry
 * keeps it. Safe to call repeatedly — it does nothing once the keys are gone.
 */
export async function importLegacyJournal(): Promise<void> {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(LEGACY_PREFIX)) keys.push(key)
  }
  if (keys.length === 0) return

  const { sqlite, db } = getDb()
  let imported = false
  for (const key of keys) {
    const date = key.slice(LEGACY_PREFIX.length)
    const body = localStorage.getItem(key) ?? ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && body.trim()) {
      await exec(sqlite, db,
        `INSERT OR IGNORE INTO journal_entries (entry_date, body) VALUES (?, ?)`, [date, body])
      imported = true
    }
    localStorage.removeItem(key)
  }
  if (imported) await persistToUserFolder()
}
