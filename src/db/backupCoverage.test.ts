/**
 * Backup coverage guard.
 *
 * Statically checks that every table created in migrations.ts is classified
 * in backupSchema.ts (backed up or explicitly derived), and that every
 * backed-up table has a restore branch in importExport.ts.
 *
 * If this test fails after you add a migration: classify the new table in
 * backupSchema.ts. If it's user data, also add a restore INSERT to
 * importExport.ts and (if needed) validation to backupValidation.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BACKUP_TABLES, DERIVED_TABLES } from './backupSchema'

function readSibling(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8')
}

/** All table names created anywhere in migrations.ts. */
function tablesCreatedByMigrations(): string[] {
  const src = readSibling('migrations.ts')
  const names = new Set<string>()
  const re = /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const name = m[1]
    // *_new tables are transient recreate-migration helpers, renamed before commit
    if (!name.endsWith('_new')) names.add(name)
  }
  return [...names]
}

describe('backup schema coverage', () => {
  const classified = new Set([
    ...BACKUP_TABLES.map(t => t.table),
    ...DERIVED_TABLES.map(t => t.table),
  ])

  it('classifies every table created by migrations as backed-up or derived', () => {
    const created = tablesCreatedByMigrations()
    expect(created.length).toBeGreaterThan(0) // regex sanity check
    const unclassified = created.filter(t => !classified.has(t))
    expect(unclassified, `Unclassified tables — add them to BACKUP_TABLES or DERIVED_TABLES in backupSchema.ts: ${unclassified.join(', ')}`).toEqual([])
  })

  it('only classifies tables that actually exist in migrations', () => {
    const created = new Set(tablesCreatedByMigrations())
    const phantom = [...classified].filter(t => !created.has(t))
    expect(phantom, `Tables classified in backupSchema.ts but never created: ${phantom.join(', ')}`).toEqual([])
  })

  it('has a restore branch in importExport.ts for every backed-up table', () => {
    const src = readSibling('importExport.ts')
    const missing = BACKUP_TABLES
      .map(t => t.table)
      .filter(table => !src.includes(`INSERT INTO ${table}`))
    expect(missing, `Backed-up tables with no restore INSERT in importExport.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('references every column added by ALTER TABLE in the restore code', () => {
    // Columns added to backed-up tables via ALTER TABLE ADD COLUMN must be
    // carried through restore, or they silently reset to defaults on import.
    // Heuristic: the column name must appear somewhere in importExport.ts.
    const migrationsSrc = readSibling('migrations.ts')
    const restoreSrc = readSibling('importExport.ts')
    const backupTables = new Set(BACKUP_TABLES.map(t => t.table))
    const missing: string[] = []
    const re = /ALTER\s+TABLE\s+([a-zA-Z_]+)\s+ADD\s+COLUMN\s+([a-zA-Z_]+)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(migrationsSrc)) !== null) {
      const [, table, column] = m
      if (backupTables.has(table) && !restoreSrc.includes(column)) {
        missing.push(`${table}.${column}`)
      }
    }
    expect(missing, `Columns added by migrations but absent from importExport.ts restore: ${missing.join(', ')}`).toEqual([])
  })

  it('has no duplicate table names or export keys', () => {
    const tables = BACKUP_TABLES.map(t => t.table)
    const keys = BACKUP_TABLES.map(t => t.key)
    expect(new Set(tables).size).toBe(tables.length)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
