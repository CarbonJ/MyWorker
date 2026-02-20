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

  // Sanity-check: run SQLite's own integrity_check pragma, which reads every
  // database page and detects corruption that query-level checks can miss.
  // Returns 'ok' on a clean database; returns an error message otherwise.
  try {
    const icRows = await exec(sqlite, db, 'PRAGMA integrity_check(1)')
    if ((icRows[0]?.integrity_check as string) !== 'ok') {
      throw new Error(`integrity_check: ${icRows[0]?.integrity_check}`)
    }
  } catch (err) {
    if (_isRetry) throw err // don't loop
    console.warn('[db] Integrity check failed — wiping IDB and reinitialising', err)
    // Close DB and VFS before deleting the IDB — otherwise deleteDatabase is
    // blocked by the open VFS connection and the old corrupt pages survive.
    await sqlite.close(db)
    await vfs.close()
    instance = null
    await deleteIdb()
    return _initDb(dirHandle, true)
  }

  return instance
}

/**
 * Persist current data to the user's OneDrive folder as a JSON export.
 * Called after every write so OneDrive always has the latest copy.
 * Uses the JSON export format (same as manual backup) for portability.
 */
export async function persistToUserFolder(): Promise<void> {
  if (!instance?.dirHandle) return

  try {
    // Snapshot all tables
    const [projects, workLogEntries, tasks, dropdownOptions] = await Promise.all([
      query('SELECT * FROM projects ORDER BY id ASC'),
      query('SELECT * FROM work_log_entries ORDER BY id ASC'),
      query('SELECT * FROM tasks ORDER BY id ASC'),
      query('SELECT * FROM dropdown_options ORDER BY id ASC'),
    ])

    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      projects,
      workLogEntries,
      tasks,
      dropdownOptions,
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

/**
 * Convenience wrapper: run a single write statement and persist to OneDrive.
 *
 * Do NOT use run() inside a BEGIN/COMMIT transaction — it calls
 * persistToUserFolder() immediately, which would sync a partial (mid-transaction)
 * database snapshot to OneDrive. Instead use exec() directly and call
 * persistToUserFolder() once after the COMMIT.
 */
export async function run(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, sql, params)
  await persistToUserFolder()
}

/** Get the last inserted row ID via SQL (last_insert_rowid not in vendored API). */
export async function lastInsertId(): Promise<number> {
  const rows = await query('SELECT last_insert_rowid() AS id')
  return rows[0]?.id as number
}

export type SQLiteCompatibleType = number | string | Uint8Array | null
