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

/**
 * Persist current data to the user's OneDrive folder as a JSON export.
 * Called after every write so OneDrive always has the latest copy.
 * Uses the JSON export format (same as manual backup) for portability.
 */
export async function persistToUserFolder(): Promise<void> {
  if (!instance?.dirHandle) return

  try {
    const data = {
      ...(await snapshotUserData()),
      savedAt: new Date().toISOString(),
    }

    const json = JSON.stringify(data, null, 2)
    const fileHandle = await instance.dirHandle.getFileHandle('myworker-data.json', { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(json)
    await writable.close()
  } catch {
    // Non-fatal — data is still safe in IndexedDB
    console.warn('[db] Failed to persist to OneDrive folder')
  }
}

/** Update the user folder handle (e.g. after Settings "change folder"). */
export function setUserFolderHandle(dirHandle: FileSystemDirectoryHandle): void {
  if (instance) instance.dirHandle = dirHandle
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
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistToUserFolder() // fire-and-forget; errors already caught inside
  }, 1500)
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

/** Get the last inserted row ID via SQL (last_insert_rowid not in vendored API). */
export async function lastInsertId(): Promise<number> {
  const rows = await query('SELECT last_insert_rowid() AS id')
  return rows[0]?.id as number
}

export type SQLiteCompatibleType = number | string | Uint8Array | null
