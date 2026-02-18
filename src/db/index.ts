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
const IDB_NAME  = 'myworker-sqlite'

export interface DbHandle {
  sqlite: SQLite.SQLiteAPI
  db: number
  dirHandle: FileSystemDirectoryHandle | null
}

let instance: DbHandle | null = null

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
 */
export async function initDb(dirHandle: FileSystemDirectoryHandle | null = null): Promise<DbHandle> {
  // Close any existing connection
  if (instance) {
    await instance.sqlite.close(instance.db)
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

  instance = { sqlite, db, dirHandle }

  // Run migrations (creates tables, FTS index, triggers, etc.)
  await runMigrations(instance)

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

/** Helper: execute SQL, returning all result rows. */
export async function exec(
  sqlite: SQLite.SQLiteAPI,
  db: number,
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const rows: Record<string, SQLiteCompatibleType>[] = []

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

  return rows
}

/** Convenience: run a query using the active db instance. */
export async function query(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const { sqlite, db } = getDb()
  return exec(sqlite, db, sql, params)
}

/** Convenience: run a write statement and persist to OneDrive. */
export async function run(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, sql, params)
  await persistToUserFolder()
}

/** Get the last inserted row ID. */
export function lastInsertId(): number {
  const { sqlite, db } = getDb()
  return sqlite.last_insert_rowid(db)
}

export type SQLiteCompatibleType = number | string | Uint8Array | null
