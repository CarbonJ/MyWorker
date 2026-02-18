/**
 * Database layer — wa-sqlite
 *
 * Architecture:
 * - SQLite runs in the main thread using wa-sqlite (sync WASM build)
 * - OPFS (browser private storage) is used for the live working database
 * - On every write, the database file is also copied to the user-chosen
 *   FileSystemDirectoryHandle (OneDrive folder) for persistence and sync
 *
 * This gives us:
 *   - Fast synchronous SQLite access via OPFS AccessHandlePoolVFS
 *   - Automatic OneDrive backup/versioning via File System Access API
 *   - Portability: on a new machine, pick the OneDrive folder and the
 *     db file is loaded from there into OPFS
 */

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite/src/sqlite-api.js'
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js'
import { runMigrations } from './migrations'

const DB_NAME = 'myworker.db'
const OPFS_DIR = 'myworker'

export interface DbHandle {
  sqlite: SQLite.SQLiteAPI
  db: number
  dirHandle: FileSystemDirectoryHandle | null
}

let instance: DbHandle | null = null

/**
 * Returns the active database handle, throwing if not yet initialised.
 */
export function getDb(): DbHandle {
  if (!instance) throw new Error('Database not initialised. Call initDb() first.')
  return instance
}

/**
 * Initialise the database.
 * - Sets up wa-sqlite with AccessHandlePoolVFS in OPFS
 * - If a user dirHandle is provided, loads the db file from it first
 * - Runs schema migrations
 * - Saves dirHandle for future persistence writes
 */
export async function initDb(dirHandle: FileSystemDirectoryHandle | null = null): Promise<DbHandle> {
  // If reinitialising, close existing connection
  if (instance) {
    await instance.sqlite.close(instance.db)
    instance = null
  }

  // Get OPFS root and create our working subdirectory
  const opfsRoot = await navigator.storage.getDirectory()
  const opfsDir = await opfsRoot.getDirectoryHandle(OPFS_DIR, { create: true })

  // If user provided a folder, copy their db file into OPFS first
  if (dirHandle) {
    await importFromUserFolder(dirHandle, opfsDir)
  }

  // Initialise wa-sqlite with the synchronous WASM build + AccessHandlePoolVFS
  const module = await SQLiteESMFactory()
  const sqlite = SQLite.Factory(module)
  const vfs = new AccessHandlePoolVFS(`/${OPFS_DIR}`)
  await vfs.isReady
  SQLite.registerVFS(sqlite, vfs)

  // Open (or create) the database
  const db = await sqlite.open_v2(
    DB_NAME,
    SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
    vfs.name,
  )

  // Enable foreign keys and WAL mode for performance
  await exec(sqlite, db, 'PRAGMA foreign_keys = ON;')
  await exec(sqlite, db, 'PRAGMA journal_mode = WAL;')

  instance = { sqlite, db, dirHandle }

  // Run migrations (creates tables, FTS index, etc.)
  await runMigrations(instance)

  return instance
}

/**
 * Copy the db file from the user's OneDrive folder into OPFS.
 * Called on first open when the user re-selects their folder.
 */
async function importFromUserFolder(
  dirHandle: FileSystemDirectoryHandle,
  opfsDir: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    const sourceHandle = await dirHandle.getFileHandle(DB_NAME)
    const file = await sourceHandle.getFile()
    const buffer = await file.arrayBuffer()
    const destHandle = await opfsDir.getFileHandle(DB_NAME, { create: true })
    const writable = await destHandle.createWritable()
    await writable.write(buffer)
    await writable.close()
  } catch (e) {
    // File doesn't exist in user folder yet — that's fine, we'll create it
  }
}

/**
 * Persist the live OPFS database file back to the user's OneDrive folder.
 * Call this after every write operation.
 */
export async function persistToUserFolder(): Promise<void> {
  if (!instance?.dirHandle) return

  const opfsRoot = await navigator.storage.getDirectory()
  const opfsDir = await opfsRoot.getDirectoryHandle(OPFS_DIR)
  const sourceHandle = await opfsDir.getFileHandle(DB_NAME)
  const file = await sourceHandle.getFile()
  const buffer = await file.arrayBuffer()

  const destHandle = await instance.dirHandle.getFileHandle(DB_NAME, { create: true })
  const writable = await destHandle.createWritable()
  await writable.write(buffer)
  await writable.close()
}

/**
 * Update the user folder handle (e.g. after user picks a new folder in Settings).
 */
export function setUserFolderHandle(dirHandle: FileSystemDirectoryHandle): void {
  if (instance) instance.dirHandle = dirHandle
}

/**
 * Helper: execute one or more SQL statements, returning all result rows.
 */
export async function exec(
  sqlite: SQLite.SQLiteAPI,
  db: number,
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const rows: Record<string, SQLiteCompatibleType>[] = []

  for await (const stmt of sqlite.statements(db, sql)) {
    // Bind parameters if provided (only on first statement)
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

/**
 * Convenience: run a query using the active db instance.
 */
export async function query(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<Record<string, SQLiteCompatibleType>[]> {
  const { sqlite, db } = getDb()
  return exec(sqlite, db, sql, params)
}

/**
 * Convenience: run a write statement and persist to user folder.
 */
export async function run(
  sql: string,
  params: SQLiteCompatibleType[] = [],
): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, sql, params)
  await persistToUserFolder()
}

/**
 * Get the last inserted row ID.
 */
export function lastInsertId(): number {
  const { sqlite, db } = getDb()
  return sqlite.last_insert_rowid(db)
}

// Re-export for convenience
export type SQLiteCompatibleType = number | string | Uint8Array | null
