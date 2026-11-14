/**
 * Tags — one vocabulary across the whole app.
 *
 * A tag can live in two places:
 *   - a tag field  (projects.tags, tasks.tags, contacts.tags — JSON arrays)
 *   - inline text  (#tag written in any markdown field: work log, task
 *                   description/notes, notebook pages, project description, …)
 *
 * The text and tag fields are the only source of truth: there is no tag table.
 * Usage is found by scanning (fast at single-user scale, and it can never drift
 * out of sync), and a rename/merge/delete rewrites the fields and text in place
 * inside one transaction. Tag identity is case-insensitive.
 */

import { exec, getDb, persistToUserFolder, query } from './index'
import {
  parseTags, stringifyTags, tagKey, extractHashtags, findHashtags,
  replaceHashtag, replaceInTagList,
} from '@/lib/tags'

export type TagSourceType = 'project' | 'task' | 'worklog' | 'note' | 'contact'

export interface TagRef {
  sourceType: TagSourceType
  id: number
  /** Display title of the record (work log entries use their project's name). */
  title: string
  /** Project to open for tasks and work log entries; null for a project-less task. */
  projectId: number | null
  /** True when the tag is in the record's tag field (as opposed to only inline text). */
  inField: boolean
  /** Text around the first inline use, when there is one. */
  snippet: string | null
  /** Sort key: when the record was last touched (work log: created). */
  date: string
}

export interface TagUsage {
  key: string
  /** Display spelling — the most common one in use. */
  name: string
  refs: TagRef[]
}

interface SourceDef {
  type: TagSourceType
  table: string
  /** SELECT returning id, title, project_id, date plus the tag and text columns. */
  select: string
  /** Column holding the JSON tag list, if the table has one. */
  tagColumn: string | null
  /** Markdown columns scanned for inline #tags. */
  textColumns: string[]
  /** Contacts' earliest tag data was comma-separated. */
  legacyCommaTags?: boolean
  /** Whether the table has an updated_at to preserve across maintenance rewrites. */
  hasUpdatedAt: boolean
}

const SOURCES: SourceDef[] = [
  {
    type: 'project', table: 'projects',
    select: `SELECT id, work_item AS title, id AS project_id, updated_at AS date, tags, work_desc, latest_status FROM projects`,
    tagColumn: 'tags', textColumns: ['work_desc', 'latest_status'], hasUpdatedAt: true,
  },
  {
    type: 'task', table: 'tasks',
    select: `SELECT id, title, project_id, updated_at AS date, tags, description, notes FROM tasks`,
    tagColumn: 'tags', textColumns: ['description', 'notes'], hasUpdatedAt: true,
  },
  {
    type: 'worklog', table: 'work_log_entries',
    select: `SELECT w.id, p.work_item AS title, w.project_id, w.created_at AS date, w.note
             FROM work_log_entries w JOIN projects p ON p.id = w.project_id`,
    tagColumn: null, textColumns: ['note'], hasUpdatedAt: false,
  },
  {
    type: 'note', table: 'notebook_pages',
    select: `SELECT id, title, NULL AS project_id, updated_at AS date, body FROM notebook_pages`,
    tagColumn: null, textColumns: ['body'], hasUpdatedAt: true,
  },
  {
    type: 'contact', table: 'contacts',
    select: `SELECT id, name AS title, NULL AS project_id, updated_at AS date, tags, notes, whos_who FROM contacts`,
    tagColumn: 'tags', textColumns: ['notes', 'whos_who'], legacyCommaTags: true, hasUpdatedAt: true,
  },
]

/** Window event fired after a rename/merge/delete so cached tag lists refresh. */
export const TAGS_CHANGED_EVENT = 'myworker:tags-changed'

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50)
  const end = Math.min(text.length, index + length + 70)
  return (start > 0 ? '…' : '') +
    text.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < text.length ? '…' : '')
}

/** Every tag in use, with the records that use it. Sorted by use count, then name. */
export async function getTagUsage(): Promise<TagUsage[]> {
  const byKey = new Map<string, { spellings: Map<string, number>; refs: TagRef[] }>()

  for (const src of SOURCES) {
    for (const row of await query(src.select)) {
      // key → { spelling, inField, snippet } for this one record
      const found = new Map<string, { name: string; inField: boolean; snippet: string | null }>()

      if (src.tagColumn) {
        for (const t of parseTags((row[src.tagColumn] as string) ?? '', src.legacyCommaTags)) {
          const name = t.trim()
          if (name && !found.has(tagKey(name))) found.set(tagKey(name), { name, inField: true, snippet: null })
        }
      }
      for (const col of src.textColumns) {
        const text = (row[col] as string | null) ?? ''
        for (const h of findHashtags(text)) {
          const key = tagKey(h.name)
          const entry = found.get(key) ?? { name: h.name, inField: false, snippet: null }
          entry.snippet ??= snippetAround(text, h.index, h.length)
          found.set(key, entry)
        }
      }

      for (const [key, f] of found) {
        const tag = byKey.get(key) ?? { spellings: new Map<string, number>(), refs: [] as TagRef[] }
        tag.spellings.set(f.name, (tag.spellings.get(f.name) ?? 0) + 1)
        tag.refs.push({
          sourceType: src.type,
          id: row.id as number,
          title: (row.title as string) || 'Untitled',
          projectId: (row.project_id as number | null) ?? null,
          inField: f.inField,
          snippet: f.snippet,
          date: (row.date as string) ?? '',
        })
        byKey.set(key, tag)
      }
    }
  }

  return [...byKey.entries()]
    .map(([key, t]) => ({
      key,
      name: [...t.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      refs: t.refs.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.refs.length - a.refs.length || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** All tag names in use (tag fields and inline #tags), sorted — for autocomplete. */
export async function getKnownTagNames(): Promise<string[]> {
  const seen = new Map<string, string>()
  const add = (name: string) => {
    const trimmed = name.trim()
    if (trimmed && !seen.has(tagKey(trimmed))) seen.set(tagKey(trimmed), trimmed)
  }
  for (const src of SOURCES) {
    const cols = [src.tagColumn, ...src.textColumns].filter(Boolean).join(', ')
    for (const row of await query(`SELECT ${cols} FROM ${src.table}`)) {
      if (src.tagColumn) parseTags((row[src.tagColumn] as string) ?? '', src.legacyCommaTags).forEach(add)
      for (const col of src.textColumns) extractHashtags((row[col] as string | null) ?? '').forEach(add)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * Rewrite one tag everywhere it is used, in a single transaction.
 * `replacement` is the new name (renaming onto an existing tag merges the two),
 * or null to delete the tag: it is removed from tag fields, and inline "#tag"
 * becomes the plain word "tag". Each record's updated_at is preserved.
 * Returns the number of records changed.
 */
async function rewriteTag(name: string, replacement: string | null): Promise<number> {
  const { sqlite, db } = getDb()
  let changed = 0
  await exec(sqlite, db, 'BEGIN')
  try {
    for (const src of SOURCES) {
      const cols = [src.tagColumn, ...src.textColumns].filter((c): c is string => !!c)
      const select = ['id', ...cols, ...(src.hasUpdatedAt ? ['updated_at'] : [])].join(', ')
      for (const row of await exec(sqlite, db, `SELECT ${select} FROM ${src.table}`)) {
        const sets: string[] = []
        const params: (string | number)[] = []
        if (src.tagColumn) {
          const before = parseTags((row[src.tagColumn] as string) ?? '', src.legacyCommaTags)
          const after = replaceInTagList(before, name, replacement)
          if (after.length !== before.length || after.some((t, i) => t !== before[i])) {
            sets.push(`${src.tagColumn} = ?`)
            params.push(stringifyTags(after))
          }
        }
        for (const col of src.textColumns) {
          const before = (row[col] as string | null) ?? ''
          const after = replaceHashtag(before, name, replacement)
          if (after !== before) {
            sets.push(`${col} = ?`)
            params.push(after)
          }
        }
        if (sets.length === 0) continue
        await exec(sqlite, db, `UPDATE ${src.table} SET ${sets.join(', ')} WHERE id = ?`, [...params, row.id as number])
        // The update above bumped updated_at via trigger; put the original back
        // (the triggers ignore writes to updated_at itself — see migration 23).
        if (src.hasUpdatedAt) {
          await exec(sqlite, db, `UPDATE ${src.table} SET updated_at = ? WHERE id = ?`,
            [row.updated_at as string, row.id as number])
        }
        changed++
      }
    }
    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }
  await persistToUserFolder()
  window.dispatchEvent(new Event(TAGS_CHANGED_EVENT))
  return changed
}

/** Rename a tag everywhere. Renaming onto an existing tag merges them. */
export function renameTag(oldName: string, newName: string): Promise<number> {
  return rewriteTag(oldName, newName.trim())
}

/** Remove a tag everywhere (inline "#tag" becomes the plain word). */
export function deleteTag(name: string): Promise<number> {
  return rewriteTag(name, null)
}
