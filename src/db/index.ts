/**
 * Database layer — wa-sqlite
 *
 * Architecture:
 * - SQLite runs on the main thread using the wa-sqlite ASYNC WASM build
 * - IDBBatchAtomicVFS stores the working database in IndexedDB
 *   (works on the main thread, unlike AccessHandlePoolVFS which requires a Worker)
 * - On every write the database is also exported and written to the user-chosen
 *   FileSystemDirectoryHandle (OneDrive folder) for persistence/sync/versioning
 *
 * This gives us:
 *   - Main-thread SQLite via async WASM (no Worker needed)
 *   - Durable IndexedDB storage for the working copy
 *   - Automatic OneDrive backup via File System Access API on every write
 *   - Portability: pick the OneDrive folder on a new machine and import the JSON backup
 *
 * Each browser has its own IndexedDB copy, so the folder file may be newer than
 * this browser's data (written from another laptop). See the folder-sync guard
 * below: nothing is written to the folder until checkFolderSync() has confirmed
 * the file is safe to overwrite.
 */

import SQLiteAsyncESMFactory from '@/vendor/wa-sqlite/wa-sqlite-async.mjs'
import * as SQLite from '@/vendor/wa-sqlite/sqlite-api.js'
import { IDBBatchAtomicVFS } from '@/vendor/wa-sqlite/examples/IDBBatchAtomicVFS.js'
import { runMigrations } from './migrations'
import { BACKUP_TABLES, DERIVED_TABLES, EXPORT_FORMAT_VERSION } from './backupSchema'

const DB_NAME = 'myworker.db'
const IDB_NAME = 'myworker-sqlite'

/** Wipe the IDBBatchAtomicVFS IndexedDB so we can start with a clean database. */
async function deleteIdb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(IDB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => {
      console.warn('[db] IDB delete blocked — closing other tabs may help')
      resolve() // proceed anyway
    }
  })
}

export interface DbHandle {
  sqlite: SQLite.SQLiteAPI
  db: number
  vfs: IDBBatchAtomicVFS
  dirHandle: FileSystemDirectoryHandle | null
}

let instance: DbHandle | null = null

/**
 * In-flight initDb promise. If initDb() is called concurrently (e.g. React
 * Strict Mode double-invoking useEffect), the second call returns the same
 * promise instead of starting a second WASM+VFS+IDB stack in parallel.
 * Parallel initialisations cause WASM memory corruption and IDB race errors.
 */
let initDbPromise: Promise<DbHandle> | null = null

/**
 * Query serialisation mutex.
 *
 * wa-sqlite uses a single SQLite connection. SQLite does not support concurrent
 * operations on one connection — interleaving prepare/step/finalize calls from
 * two concurrent async queries causes SQLITE_MISUSE ("bad parameter or other
 * API misuse"). This mutex ensures all exec() calls are serialised: each one
 * waits for the previous to fully complete before starting.
 */
let execMutex: Promise<void> = Promise.resolve()

/** Returns the active database handle, throwing if not yet initialised. */
export function getDb(): DbHandle {
  if (!instance) throw new Error('Database not initialised. Call initDb() first.')
  return instance
}

/**
 * Initialise the database.
 * - Sets up wa-sqlite async build with IDBBatchAtomicVFS (main-thread safe)
 * - Runs schema migrations
 * - Saves dirHandle for OneDrive persistence writes
 *
 * Concurrent calls are deduplicated: the second caller awaits the same promise.
 */
export function initDb(
  dirHandle: FileSystemDirectoryHandle | null = null,
): Promise<DbHandle> {
  // Deduplicate concurrent calls (React Strict Mode fires useEffect twice)
  if (initDbPromise) return initDbPromise
  initDbPromise = _initDb(dirHandle).finally(() => { initDbPromise = null })
  return initDbPromise
}

/** Internal implementation — call via initDb() only. */
async function _initDb(
  dirHandle: FileSystemDirectoryHandle | null,
  _isRetry = false,
): Promise<DbHandle> {
  // Close any existing connection (DB + VFS) before proceeding
  if (instance) {
    await instance.sqlite.close(instance.db)
    await instance.vfs.close()
    instance = null
  }

  // Async WASM build — works on the main thread
  const module = await SQLiteAsyncESMFactory({
    locateFile: (file: string) => `/${file}`,
  })
  const sqlite = SQLite.Factory(module)

  // IDBBatchAtomicVFS — stores database pages in IndexedDB, main-thread compatible
  // Works in Chrome, Edge, and Firefox. No isReady on this VFS.
  const vfs = new IDBBatchAtomicVFS(IDB_NAME)
  sqlite.vfs_register(vfs, true)

  // Open (or create) the database
  // Pass the VFS name so SQLite uses our IDB-backed VFS
  const db = await sqlite.open_v2(
    DB_NAME,
    SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
    vfs.name,
  )

  // Enable foreign keys
  await exec(sqlite, db, 'PRAGMA foreign_keys = ON;')

  instance = { sqlite, db, vfs, dirHandle }
  folderSyncState = dirHandle ? 'unchecked' : 'ok'

  // Run migrations (creates tables, FTS index, triggers, etc.)
  await runMigrations(instance)

  // Safety net: every table in the database must be classified in the backup
  // registry (backupSchema.ts) so new tables can't silently miss the backup.
  // The backupCoverage unit test is the primary gate; this catches drift at
  // runtime too (e.g. a build that skipped tests).
  const knownTables = new Set([
    ...BACKUP_TABLES.map(t => t.table),
    ...DERIVED_TABLES.map(t => t.table),
  ])
  const tableRows = await exec(sqlite, db,
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_index%'`)
  const unclassified = tableRows.map(r => r.name as string).filter(n => !knownTables.has(n))
  if (unclassified.length > 0) {
    console.error(
      '[db] Tables not classified in backupSchema.ts — they are NOT being backed up:',
      unclassified,
    )
  }

  // Record the app version that opened this database (upsert on every startup)
  await exec(sqlite, db,
    `INSERT INTO app_metadata (key, value) VALUES ('app_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [__APP_VERSION__],
  )

  // Sanity-check: run SQLite's own integrity_check pragma, which reads every
  // database page and detects corruption that query-level checks can miss.
  // Returns 'ok' on a clean database; returns an error message otherwise.
  // Skipped if the check was run within the last 24 hours (stored in app_metadata).
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
  const lastCheckRows = await exec(sqlite, db, `SELECT value FROM app_metadata WHERE key = 'last_integrity_check'`)
  const lastCheckTs = lastCheckRows[0]?.value ? Number(lastCheckRows[0].value) : 0
  const shouldCheck = Date.now() - lastCheckTs > CHECK_INTERVAL_MS

  if (shouldCheck) {
    try {
      const icRows = await exec(sqlite, db, 'PRAGMA integrity_check(1)')
      if ((icRows[0]?.integrity_check as string) !== 'ok') {
        throw new Error(`integrity_check: ${icRows[0]?.integrity_check}`)
      }
      // Record successful check time
      await exec(sqlite, db,
        `INSERT INTO app_metadata (key, value) VALUES ('last_integrity_check', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(Date.now())],
      )
    } catch (err) {
      if (_isRetry) throw err // don't loop
      console.warn('[db] Integrity check failed — attempting recovery', err)
      // Best-effort salvage of whatever is still readable, written to a
      // separate timestamped file so the main backup (myworker-data.json)
      // is never overwritten with data from a corrupt database.
      if (dirHandle) await salvageToUserFolder(dirHandle)
      // Close DB and VFS before deleting the IDB — otherwise deleteDatabase is
      // blocked by the open VFS connection and the old corrupt pages survive.
      await sqlite.close(db)
      await vfs.close()
      instance = null
      await deleteIdb()
      const fresh = await _initDb(dirHandle, true)
      await restoreAfterWipe(dirHandle)
      return fresh
    }
  }

  return instance
}

// ── Corruption recovery ───────────────────────────────────────────────────────

export interface RecoveryNotice {
  level: 'warning' | 'error'
  message: string
}

let recoveryNotice: RecoveryNotice | null = null

/**
 * One-shot read of the notice set when initDb() ran corruption recovery.
 * The app shell reads this after startup and shows it as a persistent toast.
 */
export function consumeRecoveryNotice(): RecoveryNotice | null {
  const notice = recoveryNotice
  recoveryNotice = null
  return notice
}

/**
 * Before wiping a corrupt database: export whatever is still readable to a
 * timestamped salvage file. Deliberately a separate file from the rolling
 * myworker-data.json backup. May fail if the corruption is severe — that's
 * fine, the rolling backup is the primary recovery source.
 */
async function salvageToUserFolder(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const data = {
      ...(await snapshotUserData()),
      savedAt: new Date().toISOString(),
      salvagedFromCorruptDb: true,
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const fileHandle = await dirHandle.getFileHandle(`myworker-salvage-${ts}.json`, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  } catch (err) {
    console.warn('[db] Salvage export failed (database too corrupt to read)', err)
  }
}

/**
 * After a corruption wipe: try to restore automatically from the rolling
 * OneDrive backup (myworker-data.json). Sets recoveryNotice either way so
 * the user always finds out what happened.
 */
async function restoreAfterWipe(dirHandle: FileSystemDirectoryHandle | null): Promise<void> {
  if (!dirHandle) {
    recoveryNotice = {
      level: 'error',
      message: 'Database corruption was detected and the database has been reset. ' +
        'No storage folder is connected, so no automatic restore was possible. ' +
        'Import a backup via Settings → Import.',
    }
    return
  }
  try {
    const fileHandle = await dirHandle.getFileHandle('myworker-data.json')
    const text = await (await fileHandle.getFile()).text()
    // Dynamic import avoids a static circular dependency (importExport imports from this module)
    const { restoreFromData } = await import('./importExport')
    await restoreFromData(JSON.parse(text))
    recoveryNotice = {
      level: 'warning',
      message: 'Database corruption was detected. Your data was automatically restored ' +
        'from the folder backup (myworker-data.json). Please verify your most recent changes.',
    }
  } catch (err) {
    console.error('[db] Automatic restore from folder backup failed', err)
    recoveryNotice = {
      level: 'error',
      message: 'Database corruption was detected and the automatic restore from ' +
        'myworker-data.json failed. The database has been reset — import a backup ' +
        'via Settings → Import.',
    }
  }
}

/**
 * Snapshot every user-authored table for backup, driven by the BACKUP_TABLES
 * registry in backupSchema.ts — a table added there is automatically included
 * in both the automatic OneDrive persist and the manual Settings export.
 * Also captures all myworker:* localStorage keys (UI prefs, filters, digest
 * meeting notes) so a restore brings back settings, not just data.
 */
export async function snapshotUserData(): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { version: EXPORT_FORMAT_VERSION }
  for (const { table, key } of BACKUP_TABLES) {
    // Table names come from the hard-coded registry, never from user input.
    data[key] = await query(`SELECT * FROM ${table} ORDER BY id ASC`)
  }
  data.localPrefs = collectLocalPrefs()
  return data
}

/** All myworker:* localStorage entries, for inclusion in backups. */
function collectLocalPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('myworker:')) prefs[key] = localStorage.getItem(key) ?? ''
  }
  return prefs
}

// ── Folder-sync guard ─────────────────────────────────────────────────────────
//
// The folder file (myworker-data.json) is shared by every browser/laptop that
// points at the folder, but each one has its own IndexedDB working copy. Without
// a guard, opening the app on a laptop with an older copy would overwrite newer
// data from another laptop on its first write.
//
// So persisting is held off ('unchecked') until checkFolderSync() confirms the
// file is either one this database wrote (its modified time matches the one we
// recorded after our last write) or identical in content. Otherwise the user
// chooses which copy wins (resolveFolderConflict) and the losing copy is saved
// next to it as a myworker-conflict-*.json file. If another device rewrites the
// file while this one is open, persisting stops ('conflict') and this browser's
// snapshot goes to a conflict file instead of overwriting.

const DATA_FILE = 'myworker-data.json'
/** app_metadata key: lastModified of the folder file right after this database last wrote or adopted it. */
const FOLDER_MTIME_KEY = 'folder_file_mtime'
/** app_metadata keys: savedAt stamp of the last folder file this browser wrote, and of the last write it started. */
const FOLDER_SAVED_AT_KEY = 'folder_file_saved_at'
const FOLDER_ATTEMPT_KEY = 'folder_file_attempt_saved_at'
/** Window event fired when another device changed the folder file mid-session. */
export const FOLDER_CONFLICT_EVENT = 'myworker:folder-conflict'

type FolderSyncState = 'unchecked' | 'ok' | 'conflict'
let folderSyncState: FolderSyncState = 'unchecked'
/** Parsed folder file awaiting the user's choice in resolveFolderConflict(). */
let conflictFileData: Record<string, unknown> | null = null

export interface DataCounts {
  projects: number
  tasks: number
  workLogEntries: number
  notebookPages: number
}

export interface FolderConflict {
  /** When the folder file was written (ISO), if recorded. */
  fileSavedAt: string | null
  /** Most recent change in this browser's data (ISO, approximate). */
  localChangedAt: string | null
  fileCounts: DataCounts
  localCounts: DataCounts
}

async function getMeta(key: string): Promise<string | null> {
  const { sqlite, db } = getDb()
  const rows = await exec(sqlite, db, `SELECT value FROM app_metadata WHERE key = ?`, [key])
  return (rows[0]?.value as string | undefined) ?? null
}

/** app_metadata is device-local and not backed up, so this never triggers a persist. */
async function setMeta(key: string, value: string): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db,
    `INSERT INTO app_metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

/** True when both snapshots hold the same rows in every backed-up table. */
function sameUserData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return BACKUP_TABLES.every(({ key }) =>
    JSON.stringify(a[key] ?? []) === JSON.stringify(b[key] ?? []))
}

function countsOf(data: Record<string, unknown>): DataCounts {
  const n = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0)
  return {
    projects: n('projects'),
    tasks: n('tasks'),
    workLogEntries: n('workLogEntries'),
    notebookPages: n('notebookPages'),
  }
}

/** Latest created/updated timestamp across this browser's data, as ISO. */
async function localChangedAt(): Promise<string | null> {
  const rows = await query(`
    SELECT MAX(t) AS t FROM (
      SELECT MAX(updated_at) AS t FROM projects
      UNION ALL SELECT MAX(updated_at) FROM tasks
      UNION ALL SELECT MAX(created_at) FROM work_log_entries
      UNION ALL SELECT MAX(updated_at) FROM notebook_pages
      UNION ALL SELECT MAX(updated_at) FROM contacts
    )`)
  const t = rows[0]?.t as string | null | undefined
  return t ? t.replace(' ', 'T') + 'Z' : null
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// OneDrive briefly holds or touches the file while it uploads the previous save,
// and the browser then fails the read or write with one of these. They clear up
// within seconds, so retry before telling the user the folder copy is stale.
const TRANSIENT_FILE_ERRORS = new Set(['InvalidStateError', 'NoModificationAllowedError', 'NotReadableError', 'InvalidModificationError'])
const RETRY_DELAYS_MS = [500, 2000, 5000]

async function withFileRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const transient = err instanceof DOMException && TRANSIENT_FILE_ERRORS.has(err.name)
      if (!transient || attempt >= RETRY_DELAYS_MS.length) throw err
      console.warn(`[db] Folder file busy (${err.name}), retrying`, err)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
}

async function writeJsonFile(dir: FileSystemDirectoryHandle, name: string, data: unknown): Promise<FileSystemFileHandle> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    await writable.close()
  } catch (err) {
    // Discard the temporary .crswap file so it isn't left behind in the folder
    await writable.abort().catch(() => {})
    throw err
  }
  return fileHandle
}

/** Fresh read of a folder file: its text and lastModified, retried while OneDrive has it busy. */
async function readFolderFile(fileHandle: FileSystemFileHandle): Promise<{ text: string; lastModified: number }> {
  return withFileRetry(async () => {
    const file = await fileHandle.getFile()
    return { text: await file.text(), lastModified: file.lastModified }
  })
}

/**
 * True when the folder file is one this browser wrote, judged by its savedAt
 * stamp. Covers OneDrive changing the file's timestamp without changing its
 * content, and a write that reached the disk although the browser reported an error.
 */
async function isOwnFolderFile(fileData: Record<string, unknown>): Promise<boolean> {
  const savedAt = fileData.savedAt
  if (typeof savedAt !== 'string') return false
  return savedAt === await getMeta(FOLDER_SAVED_AT_KEY) || savedAt === await getMeta(FOLDER_ATTEMPT_KEY)
}

async function getDataFileHandle(dir: FileSystemDirectoryHandle): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(DATA_FILE)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null
    throw err
  }
}

/**
 * Compare the folder file with this browser's data before anything is written
 * to the folder. Returns null when it's safe to persist (and enables persisting),
 * or the details of a conflict the user must resolve via resolveFolderConflict().
 */
export async function checkFolderSync(): Promise<FolderConflict | null> {
  const dir = instance?.dirHandle
  const fileHandle = dir ? await getDataFileHandle(dir) : null
  if (!dir || !fileHandle) {
    folderSyncState = 'ok'
    return null
  }

  const file = await withFileRetry(() => fileHandle.getFile())
  if (await getMeta(FOLDER_MTIME_KEY) === String(file.lastModified)) {
    folderSyncState = 'ok'
    return null
  }

  const { text, lastModified } = await readFolderFile(fileHandle)
  let fileData: Record<string, unknown>
  try {
    fileData = JSON.parse(text)
  } catch {
    // Unreadable file — keep a copy of it, then let this browser's data replace it
    await writeJsonFile(dir, `myworker-conflict-unreadable-${timestampForFilename()}.json`, text)
    folderSyncState = 'ok'
    return null
  }

  const local = await snapshotUserData()
  if (await isOwnFolderFile(fileData) || sameUserData(local, fileData)) {
    await setMeta(FOLDER_MTIME_KEY, String(lastModified))
    folderSyncState = 'ok'
    return null
  }

  folderSyncState = 'conflict'
  conflictFileData = fileData
  return {
    fileSavedAt: typeof fileData.savedAt === 'string' ? fileData.savedAt : null,
    localChangedAt: await localChangedAt(),
    fileCounts: countsOf(fileData),
    localCounts: countsOf(local),
  }
}

/**
 * Settle a conflict found by checkFolderSync(). The copy that loses is saved
 * next to the data file as myworker-conflict-<source>-<timestamp>.json.
 *   'folder' — load the folder file into this browser
 *   'local'  — keep this browser's data and overwrite the folder file
 */
export async function resolveFolderConflict(choice: 'folder' | 'local'): Promise<void> {
  const dir = instance?.dirHandle
  const fileData = conflictFileData
  if (!dir || !fileData) throw new Error('No folder conflict to resolve.')
  const ts = timestampForFilename()
  if (choice === 'folder') {
    await writeJsonFile(dir, `myworker-conflict-browser-${ts}.json`,
      { ...(await snapshotUserData()), savedAt: new Date().toISOString() })
    folderSyncState = 'ok'
    try {
      // Dynamic import avoids a static circular dependency (importExport imports from this module)
      const { restoreFromData } = await import('./importExport')
      await restoreFromData(fileData) // persists to the folder when done
    } catch (err) {
      folderSyncState = 'conflict' // restore rolled back — keep the folder file untouched
      throw err
    }
  } else {
    await writeJsonFile(dir, `myworker-conflict-folder-${ts}.json`, fileData)
    folderSyncState = 'ok'
    await persistToUserFolder()
  }
  conflictFileData = null
}

/** Window event fired whenever the outcome of saving to the folder changes (see getFolderSaveStatus). */
export const FOLDER_SAVE_EVENT = 'myworker:folder-save-status'

export interface FolderSaveStatus {
  /** When the folder file was last written successfully this session (ms epoch), or null. */
  lastSavedAt: number | null
  /** Why the most recent save failed, or null when it succeeded. */
  error: string | null
}

let folderSave: FolderSaveStatus = { lastSavedAt: null, error: null }

/** Outcome of the most recent save to the folder. Data is always safe in the browser either way. */
export function getFolderSaveStatus(): FolderSaveStatus {
  return folderSave
}

function setFolderSave(next: FolderSaveStatus): void {
  const changed = (next.error === null) !== (folderSave.error === null)
  folderSave = next
  // Only announce transitions (ok → failing, failing → ok), not every save
  if (changed || next.error === null) window.dispatchEvent(new Event(FOLDER_SAVE_EVENT))
}

// ── Daily snapshots ───────────────────────────────────────────────────────────
// Once per day the first successful folder save also writes a dated copy to a
// subfolder, and copies older than SNAPSHOT_DAYS are removed. A second safety
// net that doesn't depend on OneDrive's version history.

export const SNAPSHOT_FOLDER = 'MyWorkerSnapshots'
export const SNAPSHOT_DAYS = 30
/** app_metadata key: local date (YYYY-MM-DD) of the last snapshot written. */
const SNAPSHOT_DATE_KEY = 'last_snapshot_date'
const SNAPSHOT_NAME_RE = /^myworker-(\d{4}-\d{2}-\d{2})\.json$/

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function writeDailySnapshot(dir: FileSystemDirectoryHandle, data: unknown): Promise<void> {
  const today = localDate(new Date())
  if (await getMeta(SNAPSHOT_DATE_KEY) === today) return
  try {
    const snapDir = await dir.getDirectoryHandle(SNAPSHOT_FOLDER, { create: true })
    await writeJsonFile(snapDir, `myworker-${today}.json`, data)
    await setMeta(SNAPSHOT_DATE_KEY, today)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - SNAPSHOT_DAYS)
    const oldest = localDate(cutoff)
    const expired: string[] = []
    for await (const entry of snapDir.values()) {
      const m = entry.kind === 'file' ? SNAPSHOT_NAME_RE.exec(entry.name) : null
      if (m && m[1] < oldest) expired.push(entry.name)
    }
    for (const name of expired) await snapDir.removeEntry(name)
  } catch (err) {
    // A missed snapshot is not worth interrupting the user for — the main save succeeded.
    console.warn('[db] Daily snapshot failed', err)
  }
}

/** Dated snapshot files in the folder, newest first (for display in Settings). */
export async function listSnapshots(): Promise<string[]> {
  const dir = instance?.dirHandle
  if (!dir) return []
  try {
    const snapDir = await dir.getDirectoryHandle(SNAPSHOT_FOLDER)
    const dates: string[] = []
    for await (const entry of snapDir.values()) {
      const m = entry.kind === 'file' ? SNAPSHOT_NAME_RE.exec(entry.name) : null
      if (m) dates.push(m[1])
    }
    return dates.sort().reverse()
  } catch {
    return []
  }
}

// Persists run one at a time so two writes can't interleave on the same file.
let persistChain: Promise<void> = Promise.resolve()

/**
 * Persist current data to the user's OneDrive folder as a JSON export.
 * Called after every write so OneDrive always has the latest copy.
 * Uses the JSON export format (same as manual backup) for portability.
 * Does nothing until checkFolderSync() has cleared the folder for writing.
 */
export function persistToUserFolder(): Promise<void> {
  persistChain = persistChain.then(persistNow, persistNow)
  return persistChain
}

async function persistNow(): Promise<void> {
  const dir = instance?.dirHandle
  if (!dir || folderSyncState !== 'ok') return

  try {
    const snapshot = await snapshotUserData()
    const data = { ...snapshot, savedAt: new Date().toISOString() }

    // If another device rewrote the file since our last write, don't overwrite it
    const existing = await getDataFileHandle(dir)
    const marker = await getMeta(FOLDER_MTIME_KEY)
    if (existing && marker !== null) {
      const current = await withFileRetry(() => existing.getFile())
      if (String(current.lastModified) !== marker) {
        let theirs: Record<string, unknown> | null = null
        // Read failures that outlast the retries propagate as a save error rather
        // than being mistaken for another device's change
        const { text } = await readFolderFile(existing)
        try { theirs = JSON.parse(text) } catch { /* unparseable — treat as changed */ }
        if (!theirs || !(await isOwnFolderFile(theirs) || sameUserData(snapshot, theirs))) {
          folderSyncState = 'conflict'
          await writeJsonFile(dir, `myworker-conflict-browser-${timestampForFilename()}.json`, data)
          window.dispatchEvent(new Event(FOLDER_CONFLICT_EVENT))
          return
        }
      }
    }

    await setMeta(FOLDER_ATTEMPT_KEY, data.savedAt)
    const lastModified = await withFileRetry(async () => {
      const fileHandle = await writeJsonFile(dir, DATA_FILE, data)
      return (await fileHandle.getFile()).lastModified
    })
    await setMeta(FOLDER_MTIME_KEY, String(lastModified))
    await setMeta(FOLDER_SAVED_AT_KEY, data.savedAt)
    setFolderSave({ lastSavedAt: Date.now(), error: null })
    await writeDailySnapshot(dir, data)
  } catch (err) {
    // Non-fatal — data is still safe in IndexedDB — but the user must know the
    // folder copy (their backup, and what other devices read) has stopped updating.
    console.warn('[db] Failed to persist to OneDrive folder', err)
    setFolderSave({ ...folderSave, error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Update the user folder handle (e.g. after Settings "change folder").
 * Persisting pauses until checkFolderSync() has looked at the new folder's file.
 */
export function setUserFolderHandle(dirHandle: FileSystemDirectoryHandle): void {
  if (instance) {
    instance.dirHandle = dirHandle
    folderSyncState = 'unchecked'
  }
}

/**
 * Execute SQL and return all result rows.
 *
 * Serialised through execMutex so concurrent callers queue up rather than
 * interleaving their prepare/step/finalize calls, which would corrupt state.
 *
 * Use exec() directly when:
 *   - Running statements inside a manual BEGIN/COMMIT transaction (call
 *     persistToUserFolder() yourself once after COMMIT)
 *   - Running read-only queries that don't need OneDrive sync
 *
 * Use run() for simple one-shot writes outside a transaction — it calls
 * persistToUserFolder() automatically so OneDrive stays up to date.
 */
export function exec(
  sqlite: SQLite.SQLiteAPI,
  db: number,
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  // Chain onto the mutex so this call waits for any in-flight exec to finish
  const result = execMutex.then(() => _execInner(sqlite, db, sql, params))
  // Advance the mutex to this call's completion (swallow errors so the chain continues)
  execMutex = result.then(() => {}, () => {})
  return result
}

/**
 * Internal implementation of exec().
 *
 * Uses the wa-sqlite `statements()` async iterator, which handles the
 * prepare → step → finalize lifecycle for each SQL statement. A single
 * `sql` string may contain multiple statements separated by semicolons
 * (e.g. the multi-statement migration strings), and the iterator processes
 * each one in sequence. Parameters are bound positionally (? placeholders).
 */
async function _execInner(
  sqlite: SQLite.SQLiteAPI,
  db: number,
  sql: string,
  params: SQLiteCompatibleType[],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const rows: Record<string, SQLiteCompatibleType>[] = []

  try {
    for await (const stmt of sqlite.statements(db, sql)) {
      if (params.length > 0) {
        for (let i = 0; i < params.length; i++) {
          sqlite.bind(stmt, i + 1, params[i])
        }
      }
      const columns = sqlite.column_names(stmt)
      while (await sqlite.step(stmt) === SQLite.SQLITE_ROW) {
        const row: Record<string, SQLiteCompatibleType> = {}
        for (let i = 0; i < columns.length; i++) {
          row[columns[i]] = sqlite.column(stmt, i)
        }
        rows.push(row)
      }
    }
  } catch (err) {
    console.error('[db] exec error', { sql: sql.slice(0, 120), params, err })
    throw err
  }

  return rows
}

/** Convenience wrapper: run a read query using the active db instance. */
export async function query(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const { sqlite, db } = getDb()
  return exec(sqlite, db, sql, params)
}

// Debounce handle for background OneDrive persist
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  // Tab already hidden/closing (e.g. an editor flushing its autosave on the way
  // out): there may be no "later", so write straight away.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    persistTimer = null
    persistToUserFolder()
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistToUserFolder() // fire-and-forget; errors already caught inside
  }, 1500)
}

/** Write a debounced folder save now instead of waiting out the timer. */
export function flushPendingPersist(): void {
  if (!persistTimer) return
  clearTimeout(persistTimer)
  persistTimer = null
  persistToUserFolder()
}

// When the tab is hidden or closed, don't leave the last changes waiting on the
// debounce timer — start the folder write immediately so it has the best chance
// of finishing before the page goes away.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPersist()
  })
  window.addEventListener('pagehide', flushPendingPersist)
}

/**
 * Convenience wrapper: run a single write statement and persist to OneDrive.
 *
 * Do NOT use run() inside a BEGIN/COMMIT transaction — it calls
 * schedulePersist() which would sync a partial (mid-transaction) database
 * snapshot to OneDrive. Instead use exec() directly and call
 * persistToUserFolder() once after the COMMIT.
 *
 * The OneDrive persist is debounced (1.5s) and fire-and-forget so run()
 * returns immediately after the IndexedDB write completes.
 */
export async function run(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, sql, params)
  schedulePersist()
}

/**
 * Run a single INSERT statement, persist, and return the new row's id.
 *
 * The id comes from `RETURNING id` on the same statement. A separate
 * `SELECT last_insert_rowid()` would be a second exec() call, and another
 * queued insert could run in between and hand back the wrong id.
 */
export async function insert(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<number> {
  const { sqlite, db } = getDb()
  const rows = await exec(sqlite, db, `${sql} RETURNING id`, params)
  schedulePersist()
  return rows[0]?.id as number
}

export type SQLiteCompatibleType = number | string | Uint8Array | null
