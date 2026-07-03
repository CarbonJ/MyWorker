/**
 * Backup schema registry — the single source of truth for which tables are
 * captured by exports/backups.
 *
 * EVERY table created in migrations.ts must be classified here, either as:
 *   - BACKUP_TABLES: user-authored data, included in every export/backup
 *   - DERIVED_TABLES: regenerated from other data, deliberately excluded
 *
 * Two mechanisms enforce this:
 *   - backupCoverage.test.ts statically checks migrations.ts against this file,
 *     so adding a table without classifying it fails `npm test`.
 *   - initDb() compares sqlite_master against this registry at startup and
 *     logs an error for any unclassified table.
 *
 * snapshotUserData() iterates BACKUP_TABLES, so adding an entry here is all
 * that's needed for a new table to flow into the OneDrive backup and the
 * manual export. Remember to add a matching restore branch in importExport.ts
 * (the coverage test checks that too).
 *
 * This module is pure (no database imports) so tests can load it directly.
 */

export interface BackupTable {
  /** SQLite table name. */
  table: string
  /** Key used for this table's rows in the exported JSON. */
  key: string
}

/** User-authored tables, in restore order (parents before FK children). */
export const BACKUP_TABLES: BackupTable[] = [
  { table: 'dropdown_options', key: 'dropdownOptions' },
  { table: 'projects', key: 'projects' },
  { table: 'work_log_entries', key: 'workLogEntries' },
  { table: 'tasks', key: 'tasks' },
  { table: 'contacts', key: 'contacts' },
  { table: 'notebook_pages', key: 'notebookPages' },
  { table: 'saved_views', key: 'savedViews' },
]

/** Derived or device-local tables, deliberately excluded from backups. */
export const DERIVED_TABLES: { table: string; reason: string }[] = [
  { table: 'fts_index', reason: 'search index — rebuilt from source tables on import' },
  { table: 'notebook_links', reason: 'derived from note bodies — rebuilt on import and on every startup' },
  { table: 'app_metadata', reason: 'device-local state (integrity timestamps, seed flags)' },
]

/** Highest backup format version this build can read and write. */
export const EXPORT_FORMAT_VERSION = 2
