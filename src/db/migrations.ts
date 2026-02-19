/**
 * Schema migrations
 *
 * Each migration has a version number. The db tracks the current version
 * in the user_version PRAGMA. Only new migrations are applied on startup.
 */

import type { DbHandle } from './index'
import { exec } from './index'

interface Migration {
  version: number
  up: string
}

const migrations: Migration[] = [
  {
    version: 1,
    up: `
      -- Core tables
      CREATE TABLE IF NOT EXISTS dropdown_options (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL CHECK(type IN ('priority','product_area')),
        label       TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS projects (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        work_item       TEXT NOT NULL,
        work_desc       TEXT NOT NULL DEFAULT '',
        rag_status      TEXT NOT NULL DEFAULT 'Green'
                          CHECK(rag_status IN ('Red','Amber','Green')),
        priority_id     INTEGER REFERENCES dropdown_options(id) ON DELETE SET NULL,
        latest_status   TEXT NOT NULL DEFAULT '',
        product_area_id INTEGER REFERENCES dropdown_options(id) ON DELETE SET NULL,
        stakeholders    TEXT NOT NULL DEFAULT '',
        linked_jiras    TEXT NOT NULL DEFAULT '',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
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
        status      TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','in_progress','done')),
        owner       TEXT NOT NULL DEFAULT '',
        start_date  TEXT,
        due_date    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- FTS5 virtual table: full-text search across projects, tasks, work log
      -- Uses porter stemmer so "reporting" matches "report"
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
        content,
        source_type UNINDEXED,
        source_id   UNINDEXED,
        project_id  UNINDEXED,
        tokenize    = 'porter ascii'
      );

      -- Triggers to keep updated_at current on projects
      CREATE TRIGGER IF NOT EXISTS projects_updated_at
        AFTER UPDATE ON projects
        BEGIN
          UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

      -- Triggers to keep updated_at current on tasks
      CREATE TRIGGER IF NOT EXISTS tasks_updated_at
        AFTER UPDATE ON tasks
        BEGIN
          UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

      -- FTS triggers: keep fts_index in sync with projects
      CREATE TRIGGER IF NOT EXISTS fts_projects_insert
        AFTER INSERT ON projects
        BEGIN
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.work_item || ' ' || NEW.work_desc || ' ' || NEW.latest_status || ' ' || NEW.stakeholders,
            'project', NEW.id, NEW.id
          );
        END;

      CREATE TRIGGER IF NOT EXISTS fts_projects_update
        AFTER UPDATE ON projects
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'project' AND source_id = OLD.id;
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.work_item || ' ' || NEW.work_desc || ' ' || NEW.latest_status || ' ' || NEW.stakeholders,
            'project', NEW.id, NEW.id
          );
        END;

      CREATE TRIGGER IF NOT EXISTS fts_projects_delete
        AFTER DELETE ON projects
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'project' AND source_id = OLD.id;
        END;

      -- FTS triggers: keep fts_index in sync with tasks
      CREATE TRIGGER IF NOT EXISTS fts_tasks_insert
        AFTER INSERT ON tasks
        BEGIN
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.title || ' ' || NEW.description || ' ' || NEW.notes || ' ' || NEW.owner,
            'task', NEW.id, NEW.project_id
          );
        END;

      CREATE TRIGGER IF NOT EXISTS fts_tasks_update
        AFTER UPDATE ON tasks
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'task' AND source_id = OLD.id;
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.title || ' ' || NEW.description || ' ' || NEW.notes || ' ' || NEW.owner,
            'task', NEW.id, NEW.project_id
          );
        END;

      CREATE TRIGGER IF NOT EXISTS fts_tasks_delete
        AFTER DELETE ON tasks
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'task' AND source_id = OLD.id;
        END;

      -- FTS triggers: keep fts_index in sync with work log entries
      CREATE TRIGGER IF NOT EXISTS fts_worklog_insert
        AFTER INSERT ON work_log_entries
        BEGIN
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (NEW.note, 'work_log', NEW.id, NEW.project_id);
        END;

      CREATE TRIGGER IF NOT EXISTS fts_worklog_delete
        AFTER DELETE ON work_log_entries
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'work_log' AND source_id = OLD.id;
        END;
    `,
  },
  {
    version: 2,
    up: `ALTER TABLE tasks ADD COLUMN priority_id INTEGER REFERENCES dropdown_options(id) ON DELETE SET NULL;`,
  },
  {
    version: 3,
    up: `ALTER TABLE dropdown_options ADD COLUMN color TEXT NOT NULL DEFAULT '';`,
  },
]

export async function runMigrations(handle: DbHandle): Promise<void> {
  const { sqlite, db } = handle

  // Get current schema version
  const versionRows = await exec(sqlite, db, 'PRAGMA user_version;')
  const currentVersion = Number(versionRows[0]?.user_version ?? 0)

  // Apply any migrations newer than current version
  const pending = migrations.filter(m => m.version > currentVersion)
  if (pending.length === 0) return

  for (const migration of pending) {
    try {
      await exec(sqlite, db, migration.up)
      await exec(sqlite, db, `PRAGMA user_version = ${migration.version};`)
    } catch (err) {
      console.error(`[db] Migration v${migration.version} FAILED`, err)
      throw err
    }
  }
}
