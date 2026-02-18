// Database initialisation — wa-sqlite with File System Access API
// This module manages the SQLite database stored in a user-chosen folder (OneDrive).

let db: unknown = null

export async function getDb() {
  if (db) return db
  // TODO: initialise wa-sqlite with File System Access API
  // 1. Prompt user to pick a folder (FileSystemDirectoryHandle)
  // 2. Open/create myworker.db in that folder
  // 3. Run schema migrations
  // 4. Enable FTS5 virtual tables for search
  throw new Error('Database not yet initialised')
}

export async function initDb(_dirHandle: FileSystemDirectoryHandle) {
  // TODO: implement wa-sqlite initialisation
  // Schema:
  //   projects, work_log_entries, tasks, dropdown_options, fts_index
}

export const schema = `
  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    work_item   TEXT NOT NULL,
    work_desc   TEXT NOT NULL DEFAULT '',
    rag_status  TEXT NOT NULL DEFAULT 'Green',
    priority_id INTEGER REFERENCES dropdown_options(id),
    latest_status TEXT NOT NULL DEFAULT '',
    product_area_id INTEGER REFERENCES dropdown_options(id),
    stakeholders TEXT NOT NULL DEFAULT '',
    linked_jiras TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS work_log_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    note        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open',
    owner       TEXT NOT NULL DEFAULT '',
    start_date  TEXT,
    due_date    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dropdown_options (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  -- FTS5 virtual table for full-text search across projects, tasks, and work log
  CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
    content,
    source_type,  -- 'project' | 'task' | 'work_log'
    source_id,
    project_id,
    tokenize = 'porter ascii'
  );
`
