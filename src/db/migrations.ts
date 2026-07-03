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
  {
    version: 8,
    up: `
      -- Allow tasks to be scoped directly to a product area (without a project).
      -- Three task tiers: project task (project_id set), area task (product_area_id set),
      -- inbox task (both null). When project_id is set the area is inherited from the
      -- project at query time; product_area_id on the task is only meaningful for
      -- area tasks (project_id IS NULL).
      ALTER TABLE tasks ADD COLUMN product_area_id INTEGER
        REFERENCES dropdown_options(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_product_area_id ON tasks(product_area_id);
    `,
  },
  {
    version: 9,
    up: `
      -- Optional due date for a project. Used to display an overdue banner
      -- on the Project Detail screen when the project has passed its due date.
      ALTER TABLE projects ADD COLUMN due_date TEXT;
    `,
  },
  {
    version: 10,
    up: `
      -- App metadata store: key/value pairs written by the app at startup.
      -- Currently used to record which app version last opened this database.
      CREATE TABLE IF NOT EXISTS app_metadata (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 11,
    up: `
      -- Recurring tasks: when marked complete, prompt for next due date and
      -- reset to open rather than leaving as done.
      ALTER TABLE tasks ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 12,
    up: `
      CREATE INDEX IF NOT EXISTS idx_worklog_project_created
      ON work_log_entries(project_id, created_at DESC);
    `,
  },
  {
    version: 13,
    up: `
      -- Add tags column to projects and tasks
      ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '';
      ALTER TABLE tasks    ADD COLUMN tags TEXT NOT NULL DEFAULT '';

      -- Rebuild project FTS triggers to include tags
      DROP TRIGGER IF EXISTS fts_projects_insert;
      DROP TRIGGER IF EXISTS fts_projects_update;

      CREATE TRIGGER fts_projects_insert
        AFTER INSERT ON projects
        BEGIN
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.work_item || ' ' || NEW.work_desc || ' ' || NEW.latest_status || ' ' || NEW.stakeholders || ' ' || NEW.tags,
            'project', NEW.id, NEW.id
          );
        END;

      CREATE TRIGGER fts_projects_update
        AFTER UPDATE ON projects
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'project' AND source_id = OLD.id;
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.work_item || ' ' || NEW.work_desc || ' ' || NEW.latest_status || ' ' || NEW.stakeholders || ' ' || NEW.tags,
            'project', NEW.id, NEW.id
          );
        END;

      -- Rebuild task FTS triggers to include tags
      DROP TRIGGER IF EXISTS fts_tasks_insert;
      DROP TRIGGER IF EXISTS fts_tasks_update;

      CREATE TRIGGER fts_tasks_insert
        AFTER INSERT ON tasks
        BEGIN
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.title || ' ' || NEW.description || ' ' || NEW.notes || ' ' || NEW.owner || ' ' || NEW.tags,
            'task', NEW.id, NEW.project_id
          );
        END;

      CREATE TRIGGER fts_tasks_update
        AFTER UPDATE ON tasks
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'task' AND source_id = OLD.id;
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (
            NEW.title || ' ' || NEW.description || ' ' || NEW.notes || ' ' || NEW.owner || ' ' || NEW.tags,
            'task', NEW.id, NEW.project_id
          );
        END;
    `,
  },
  {
    version: 14,
    up: `
      -- Decouple archiving from the "Done" status label.
      -- is_archived = 1 means the project is in the archive regardless of
      -- what the user has named their project status options.
      ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
      -- Back-fill: any project whose status_id currently points to a "Done"
      -- option is considered archived.
      UPDATE projects
        SET is_archived = 1
        WHERE status_id IN (
          SELECT id FROM dropdown_options
          WHERE type = 'project_status' AND lower(label) = 'done'
        );
    `,
  },
  {
    version: 15,
    up: `
      -- Re-run the is_archived back-fill as a standalone migration.
      -- Migration v14 can hit a "duplicate column name" error on databases
      -- where the ALTER TABLE committed but the process crashed before
      -- PRAGMA user_version was written. The migration runner's catch block
      -- skips the entire v14 SQL in that case, leaving is_archived = 0 for
      -- all rows. This migration fixes that: it's a pure UPDATE with no DDL
      -- so it cannot fail with duplicate column, and it is safe to run on
      -- databases where the v14 back-fill already ran (WHERE is_archived = 0
      -- simply won't match those rows).
      UPDATE projects
        SET is_archived = 1
        WHERE is_archived = 0
          AND status_id IN (
            SELECT id FROM dropdown_options
            WHERE type = 'project_status' AND lower(label) = 'done'
          );
    `,
  },
  {
    version: 16,
    up: `
      CREATE TABLE IF NOT EXISTS saved_views (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        page       TEXT NOT NULL,
        name       TEXT NOT NULL,
        data       TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(page, name)
      );
    `,
  },
  {
    version: 17,
    up: `
      -- Work log entries are now editable but the FTS triggers only covered
      -- INSERT + DELETE. Add an UPDATE trigger so edited entries stay indexed.
      CREATE TRIGGER IF NOT EXISTS fts_worklog_update
        AFTER UPDATE ON work_log_entries
        BEGIN
          DELETE FROM fts_index WHERE source_type = 'work_log' AND source_id = OLD.id;
          INSERT INTO fts_index(content, source_type, source_id, project_id)
          VALUES (NEW.note, 'work_log', NEW.id, NEW.project_id);
        END;
    `,
  },
  {
    version: 18,
    up: `
      CREATE TABLE IF NOT EXISTS contacts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT '',
        group_name TEXT NOT NULL DEFAULT '',
        notes      TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TRIGGER IF NOT EXISTS contacts_updated_at
        AFTER UPDATE ON contacts
        BEGIN
          UPDATE contacts SET updated_at = datetime('now') WHERE id = NEW.id;
        END;

      CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
    `,
  },
  {
    version: 19,
    up: `
      CREATE TABLE notebook_pages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL DEFAULT 'Untitled',
        body       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TRIGGER notebook_pages_updated_at
      AFTER UPDATE ON notebook_pages
      BEGIN
        UPDATE notebook_pages SET updated_at = datetime('now') WHERE id = NEW.id;
      END;

      CREATE TABLE notebook_links (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        source_page_id INTEGER NOT NULL REFERENCES notebook_pages(id) ON DELETE CASCADE,
        target_type    TEXT NOT NULL,
        target_id      INTEGER,
        target_name    TEXT NOT NULL,
        UNIQUE(source_page_id, target_name)
      );

      CREATE INDEX idx_notebook_links_target ON notebook_links(target_type, target_id);
      CREATE INDEX idx_notebook_links_source ON notebook_links(source_page_id);

      CREATE TRIGGER fts_notebook_insert AFTER INSERT ON notebook_pages BEGIN
        INSERT INTO fts_index(content, source_type, source_id, project_id)
        VALUES (NEW.title || ' ' || NEW.body, 'notebook', NEW.id, 0);
      END;

      CREATE TRIGGER fts_notebook_update AFTER UPDATE ON notebook_pages BEGIN
        DELETE FROM fts_index WHERE source_type = 'notebook' AND source_id = OLD.id;
        INSERT INTO fts_index(content, source_type, source_id, project_id)
        VALUES (NEW.title || ' ' || NEW.body, 'notebook', NEW.id, 0);
      END;

      CREATE TRIGGER fts_notebook_delete AFTER DELETE ON notebook_pages BEGIN
        DELETE FROM fts_index WHERE source_type = 'notebook' AND source_id = OLD.id;
      END;
    `,
  },
  {
    version: 20,
    up: `ALTER TABLE contacts ADD COLUMN whos_who TEXT NOT NULL DEFAULT '';`,
  },
  {
    version: 21,
    up: `
      -- App-generated work log entries (task-completion lines) were previously
      -- identified by matching the note text against '✓ Completed%' — fragile,
      -- and it silently hid any user note that happened to start the same way.
      -- Replace the convention with an explicit flag; back-fill existing rows.
      ALTER TABLE work_log_entries ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
      UPDATE work_log_entries SET is_system = 1 WHERE note LIKE '✓ Completed%';
    `,
  },
]

export async function runMigrations(handle: DbHandle): Promise<void> {
  const { sqlite, db } = handle

  // Read the version that was last successfully applied on this device
  const versionRows = await exec(sqlite, db, 'PRAGMA user_version;')
  const currentVersion = Number(versionRows[0]?.user_version ?? 0)

  const pending = migrations.filter(m => m.version > currentVersion)

  if (pending.length > 0) {
    // Disable FK enforcement while migrating (must happen outside a transaction).
    // With FKs enabled, DROP TABLE runs an implicit DELETE that fires ON DELETE
    // actions against child tables — a table-recreation migration (copy → drop →
    // rename, like v4/v5) would null out or cascade-delete referencing rows.
    await exec(sqlite, db, 'PRAGMA foreign_keys = OFF;')
    try {
      for (const migration of pending) {
        // Migration body and user_version bump commit atomically: a crash or
        // error can never leave the schema changed but the version un-bumped
        // (PRAGMA user_version is transactional in SQLite).
        await exec(sqlite, db, 'BEGIN')
        try {
          await exec(sqlite, db, migration.up)
          await exec(sqlite, db, `PRAGMA user_version = ${migration.version};`)
          await exec(sqlite, db, 'COMMIT')
        } catch (err) {
          await exec(sqlite, db, 'ROLLBACK')
          const msg = err instanceof Error ? err.message : String(err)
          // Legacy recovery: before the runner was transactional, a crash
          // between a migration's ADD COLUMN and the version bump left the
          // column present with the version un-bumped, so the retry hits
          // "duplicate column name". The schema is already in the desired
          // state — just bump the version.
          if (msg.includes('duplicate column name')) {
            await exec(sqlite, db, `PRAGMA user_version = ${migration.version};`)
            continue
          }
          console.error(`[db] Migration v${migration.version} FAILED`, err)
          throw err
        }
      }
    } finally {
      await exec(sqlite, db, 'PRAGMA foreign_keys = ON;')
    }
  }

  // One-time data migration: seed contacts table from unique stakeholder names
  // stored across all projects. Runs after schema migrations so the contacts
  // table is guaranteed to exist. Skipped on subsequent startups via app_metadata.
  await seedContactsFromStakeholders(sqlite, db)
}

async function seedContactsFromStakeholders(
  sqlite: DbHandle['sqlite'],
  db: DbHandle['db'],
): Promise<void> {
  // Check whether we've already done this
  const flagRows = await exec(sqlite, db,
    `SELECT value FROM app_metadata WHERE key = 'contacts_seeded_from_stakeholders'`)
  if (flagRows[0]?.value === '1') return

  // Fetch all non-empty stakeholder blobs from projects
  const projectRows = await exec(sqlite, db,
    `SELECT stakeholders FROM projects WHERE stakeholders IS NOT NULL AND stakeholders != ''`)

  // Parse each blob (JSON array of {name} objects, or legacy comma-separated string)
  const nameSet = new Set<string>()
  for (const row of projectRows) {
    const raw = row.stakeholders as string
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          const n = (s as { name?: string })?.name?.trim()
          if (n) nameSet.add(n)
        }
      }
    } catch {
      // Legacy comma-separated fallback
      for (const n of raw.split(',')) {
        const trimmed = n.trim()
        if (trimmed) nameSet.add(trimmed)
      }
    }
  }

  if (nameSet.size === 0) {
    await exec(sqlite, db,
      `INSERT INTO app_metadata (key, value) VALUES ('contacts_seeded_from_stakeholders', '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`)
    return
  }

  // Fetch names already in contacts so we don't create duplicates
  const existingRows = await exec(sqlite, db, `SELECT name FROM contacts`)
  const existing = new Set(existingRows.map(r => (r.name as string).toLowerCase()))

  for (const name of nameSet) {
    if (!existing.has(name.toLowerCase())) {
      await exec(sqlite, db,
        `INSERT INTO contacts (name) VALUES (?)`, [name])
    }
  }

  await exec(sqlite, db,
    `INSERT INTO app_metadata (key, value) VALUES ('contacts_seeded_from_stakeholders', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`)
}
