/**
 * Data Health — finds clutter and broken references, and fixes them.
 *
 * Every check is read-only. Fixes go through the normal write paths: text is
 * rewritten with rewriteRecords() (one transaction, updated_at preserved),
 * deletions go to the Trash, and nothing here deletes a user record outright.
 */

import { exec, getDb, persistToUserFolder, query } from './index'
import { SOURCES, getTagUsage, renameTag, rewriteRecords, type TagRef } from './tags'
import { groupSimilarTags, tagKey } from '@/lib/tags'
import { loadAllEntities, rebuildAllLinks, createNotebookPage } from './notebook'
import { notifyLinksChanged } from './links'
import { getOptionUsageCount } from './dropdownOptions'
import { moveToTrash } from './trash'
import { findWikiEntity, findWikiLinks, replaceWikiLink, unlinkWikiLink, wikiLinkKey } from '@/lib/wikiLinks'
import type { DropdownType } from '@/types'

/** wikiLinkKey of every [[link]] target written anywhere. */
async function linkedKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const src of SOURCES) {
    const where = src.textColumns.map(c => `${c} LIKE '%[%'`).join(' OR ')
    for (const row of await query(`SELECT * FROM (${src.select}) WHERE ${where}`)) {
      for (const col of src.textColumns) {
        for (const link of findWikiLinks((row[col] as string | null) ?? '')) keys.add(wikiLinkKey(link.name))
      }
    }
  }
  return keys
}

// ── Broken [[links]] ─────────────────────────────────────────────────────────

export interface BrokenLink {
  /** The link text, as most often written. */
  name: string
  /** Records containing it (one entry per record). */
  refs: TagRef[]
  /** The closest existing name, when there is a likely match (a typo, or a renamed entity). */
  suggestion: { type: string; id: number; name: string } | null
  /**
   * Only Journal entries link to it. Those are usually notes planned for a day
   * (a meeting that was cancelled or needed none) rather than mistakes.
   */
  onlyInJournal: boolean
}

/** Edit distance between two short strings. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]
}

function closest<T extends { name: string }>(entities: T[], name: string): T | null {
  const key = wikiLinkKey(name)
  let best: T | null = null
  let bestScore = Infinity
  for (const e of entities) {
    const k = wikiLinkKey(e.name)
    if (!k) continue
    // One name contained in the other (e.g. a shortened title) is a strong hint
    const contained = Math.min(k.length, key.length) >= 4 && (k.includes(key) || key.includes(k))
    const score = contained ? Math.abs(k.length - key.length) / 10 : distance(k, key)
    if (score < bestScore) { best = e; bestScore = score }
  }
  // Close enough to be a typo or a small rename
  return best && bestScore <= Math.max(2, key.length * 0.2) ? best : null
}

/** [[links]] in any text that point at nothing. Most-used first. */
export async function findBrokenLinks(): Promise<BrokenLink[]> {
  const entities = await loadAllEntities()
  const byKey = new Map<string, { spellings: Map<string, number>; refs: TagRef[] }>()
  for (const src of SOURCES) {
    const where = src.textColumns.map(c => `${c} LIKE '%[%'`).join(' OR ')
    for (const row of await query(`SELECT * FROM (${src.select}) WHERE ${where}`)) {
      const seen = new Set<string>()
      for (const col of src.textColumns) {
        for (const link of findWikiLinks((row[col] as string | null) ?? '')) {
          const key = wikiLinkKey(link.name)
          if (!key || findWikiEntity(entities, link.name)) continue
          const entry = byKey.get(key) ?? { spellings: new Map<string, number>(), refs: [] as TagRef[] }
          const spelling = link.name.trim()
          entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1)
          if (!seen.has(key)) {
            seen.add(key)
            entry.refs.push({
              sourceType: src.type,
              id: row.id as number,
              title: (row.title as string) || 'Untitled',
              projectId: (row.project_id as number | null) ?? null,
              inField: false,
              snippet: null,
              date: (row.date as string) ?? '',
            })
          }
          byKey.set(key, entry)
        }
      }
    }
  }
  return [...byKey.values()]
    .map(e => {
      const name = [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return {
        name,
        refs: e.refs.sort((a, b) => b.date.localeCompare(a.date)),
        suggestion: closest(entities, name),
        onlyInJournal: e.refs.every(r => r.sourceType === 'journal'),
      }
    })
    .sort((a, b) => b.refs.length - a.refs.length || a.name.localeCompare(b.name))
}

async function afterLinkRewrite(changed: number): Promise<number> {
  if (changed > 0) {
    await rebuildAllLinks()
    notifyLinksChanged()
  }
  return changed
}

/** Point every [[from]] link at `to`. Returns the number of records changed. */
export async function repointLinks(from: string, to: string): Promise<number> {
  return afterLinkRewrite(await rewriteRecords(text => replaceWikiLink(text, from, to)))
}

/** Turn every [[name]] link into plain text. Returns the number of records changed. */
export async function unlinkLinks(name: string): Promise<number> {
  return afterLinkRewrite(await rewriteRecords(text => unlinkWikiLink(text, name)))
}

/** Create an empty note with this title, so the links to it work. */
export async function createNoteForLink(name: string): Promise<number> {
  const id = await createNotebookPage(name.trim(), '')
  await rebuildAllLinks()
  return id
}

// ── Open tasks in archived projects ──────────────────────────────────────────

export interface ArchivedOpenTask {
  id: number
  title: string
  status: string
  projectId: number
  projectName: string
}

/** Tasks still open or in progress although their project is archived (e.g. added after it was closed). */
export async function findOpenTasksInArchivedProjects(): Promise<ArchivedOpenTask[]> {
  const rows = await query(`
    SELECT t.id, t.title, t.status, p.id AS project_id, p.work_item
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE p.is_archived = 1 AND t.status != 'done'
    ORDER BY p.work_item COLLATE NOCASE, t.title COLLATE NOCASE`)
  return rows.map(r => ({
    id: r.id as number, title: (r.title as string) || 'Untitled task', status: r.status as string,
    projectId: r.project_id as number, projectName: r.work_item as string,
  }))
}

/**
 * Mark these tasks done the way closing their project would have: their status
 * is remembered, so reopening the project brings them back as they were.
 */
export async function closeTasksOfArchivedProjects(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    for (const id of ids) {
      await exec(sqlite, db,
        `UPDATE tasks SET pre_archive_status = status, status = 'done'
         WHERE id = ? AND status != 'done'
           AND project_id IN (SELECT id FROM projects WHERE is_archived = 1)`, [id])
    }
    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }
  await persistToUserFolder()
}

// ── Empty notes ──────────────────────────────────────────────────────────────

export interface EmptyNote {
  id: number
  title: string
  createdAt: string
  /** Other text links to it, so removing it would break those links. */
  linkedTo: boolean
}

/** Notebook pages with no text (the Home page is never listed). */
export async function findEmptyNotes(): Promise<EmptyNote[]> {
  const rows = await query(`
    SELECT id, title, created_at FROM notebook_pages
    WHERE trim(body) = '' AND is_home = 0
    ORDER BY created_at DESC`)
  if (rows.length === 0) return []
  const linked = await linkedKeys()
  return rows.map(r => ({
    id: r.id as number,
    title: (r.title as string) || 'Untitled',
    createdAt: r.created_at as string,
    linkedTo: linked.has(wikiLinkKey((r.title as string) || 'Untitled')),
  }))
}

/** Move these notes to the Trash (restorable for 30 days). */
export async function trashNotes(ids: number[]): Promise<void> {
  for (const id of ids) await moveToTrash('note', id)
}

// ── Possible duplicate contacts ──────────────────────────────────────────────

export interface DuplicateContacts {
  name: string
  contacts: { id: number; name: string; role: string }[]
}

/** Contacts whose names match apart from case, spacing or punctuation. */
export async function findDuplicateContacts(): Promise<DuplicateContacts[]> {
  const rows = await query(`SELECT id, name, role FROM contacts ORDER BY name COLLATE NOCASE`)
  const groups = new Map<string, DuplicateContacts['contacts']>()
  for (const r of rows) {
    const key = wikiLinkKey((r.name as string) ?? '').replace(/[^\p{L}\p{N}]/gu, '')
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), { id: r.id as number, name: r.name as string, role: (r.role as string) ?? '' }])
  }
  return [...groups.values()].filter(g => g.length > 1).map(contacts => ({ name: contacts[0].name, contacts }))
}

// ── Unused dropdown values ───────────────────────────────────────────────────

export interface UnusedOption {
  id: number
  type: DropdownType
  label: string
}

const OPTION_TYPES: DropdownType[] = ['priority', 'product_area', 'project_status']

/**
 * Dropdown values no project or task uses. Areas that are [[linked]] somewhere
 * are left out (deleting them would break those links), and so is the done
 * status, which Mark Complete relies on.
 */
export async function findUnusedOptions(): Promise<UnusedOption[]> {
  const rows = await query(`SELECT id, type, label, is_done FROM dropdown_options WHERE type IN ('priority', 'product_area', 'project_status') ORDER BY type, sort_order`)
  const linked = await linkedKeys()
  const out: UnusedOption[] = []
  for (const r of rows) {
    const type = r.type as DropdownType
    const label = r.label as string
    if (!OPTION_TYPES.includes(type)) continue
    if (type === 'project_status' && r.is_done) continue
    if (type === 'product_area' && linked.has(wikiLinkKey(label))) continue
    if (await getOptionUsageCount(r.id as number, type) === 0) out.push({ id: r.id as number, type, label })
  }
  return out
}

// ── Similar tags ─────────────────────────────────────────────────────────────

export interface SimilarTags {
  /** Most-used first. `inline` = written as #tag in some text, so a name with spaces can't replace it. */
  tags: { name: string; count: number; inline: boolean }[]
}

/** Tags that look like one tag written differently ("risk review" / "riskreview" / "risk-reviews"). */
export async function findSimilarTags(): Promise<SimilarTags[]> {
  const usage = (await getTagUsage()).map(t => ({ name: t.name, count: t.refs.length, inline: t.refs.some(r => r.snippet !== null || !r.inField) }))
  return groupSimilarTags(usage)
    .map(tags => ({ tags }))
    .sort((a, b) => a.tags[0].name.localeCompare(b.tags[0].name, undefined, { sensitivity: 'base' }))
}

/** Rename every other tag in the group onto `into`. Returns the number of records changed. */
export async function mergeTags(names: string[], into: string): Promise<number> {
  let changed = 0
  for (const name of names) if (tagKey(name) !== tagKey(into)) changed += await renameTag(name, into)
  return changed
}
