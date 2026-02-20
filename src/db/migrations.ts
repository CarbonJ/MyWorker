/**
 * Schema migrations
 *
 * How the system works:
 * - SQLite's built-in `user_version` PRAGMA stores the current schema version.
 *   It starts at 0 on a fresh database and is bumped to `migration.version`
 *   after each migration runs successfully.
 * - On every app startup, runMigrations() checks user_version and applies only
 *   the migrations with a version number higher than the stored value.
 *   This means migrations run exactly once per installation, in order.
 *
 * IMPORTANT — never edit an existing migration:
 *   Once a migration has been applied to any real database it cannot safely be
 *   changed. Editing it only affects new installations — existing ones have
 *   already run that version and will never re-run it. To make a schema change,
 *   always add a new migration with the next version number.
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
  {
    version: 4,
    up: `
      -- Recreate tasks table with nullable project_id (to support inbox tasks)
      CREATE TABLE IF NOT EXISTS tasks_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        notes       TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','in_progress','done')),
        owner       TEXT NOT NULL DEFAULT '',
        priority_id INTEGER REFERENCES dropdown_options(id) ON DELETE SET NULL,
        start_date  TEXT,
        due_date    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO tasks_new
        (id, project_id, title, description, notes, status, owner, priority_id, start_date, due_date, created_at, updated_at)
      SELECT
        id, project_id, title, description, notes, status, owner, priority_id, start_date, due_date, created_at, updated_at
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      CREATE TRIGGER IF NOT EXISTS tasks_updated_at
        AFTER UPDATE ON tasks
        BEGIN
          UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

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
    `,
  },
  {
    version: 5,
    up: `
      -- Recreate dropdown_options without the type CHECK constraint so 'project_status' is valid
      CREATE TABLE IF NOT EXISTS dropdown_options_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL,
        label      TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        color      TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO dropdown_options_new (id, type, label, sort_order, color)
        SELECT id, type, label, sort_order, color FROM dropdown_options;
      DROP TABLE dropdown_options;
      ALTER TABLE dropdown_options_new RENAME TO dropdown_options;

      -- Add lifecycle status column to projects
      ALTER TABLE projects ADD COLUMN status_id INTEGER REFERENCES dropdown_options(id) ON DELETE SET NULL;

      -- Seed default project status options
      INSERT INTO dropdown_options (type, label, sort_order, color) VALUES
        ('project_status', 'To Do',       0, ''),
        ('project_status', 'In Progress', 1, 'blue'),
        ('project_status', 'Backlog',     2, 'amber'),
        ('project_status', 'Done',        3, 'green');
    `,
  },
  {
    version: 6,
    up: `ALTER TABLE tasks ADD COLUMN pre_archive_status TEXT;`,
  },
  {
    version: 7,
    up: `
      -- Performance indexes for the most common query patterns.
      -- Without these, every lookup scans every row; with them, SQLite jumps
      -- directly to matching rows. Impact grows as data accumulates over time.
      CREATE INDEX IF NOT EXISTS idx_projects_updated_at   ON projects(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id      ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date        ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_worklog_project_id    ON work_log_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_dropdown_type         ON dropdown_options(type);
    `,
  },
]

export async function runMigrations(handle: DbHandle): Promise<void> {
  const { sqlite, db } = handle

  // Read the version that was last successfully applied on this device
  const versionRows = await exec(sqlite, db, 'PRAGMA user_version;')
  const currentVersion = Number(versionRows[0]?.user_version ?? 0)

  // Skip if already up to date (the common case on subsequent app loads)
  const pending = migrations.filter(m => m.version > currentVersion)
  if (pending.length === 0) return

  for (const migration of pending) {
    try {
      await exec(sqlite, db, migration.up)
      // Bump user_version only after the migration succeeds.
      // If the migration throws, user_version stays at the previous value
      // and the migration will be retried on the next startup.
      await exec(sqlite, db, `PRAGMA user_version = ${migration.version};`)
    } catch (err) {
      console.error(`[db] Migration v${migration.version} FAILED`, err)
      throw err
    }
  }
}
