/**
 * Wiki-link maintenance and "mentioned in" lookups.
 *
 * [[Name]] links are plain text matched to an entity by name, so renaming an
 * entity would orphan every link to it. renameWikiLinks() rewrites them, and is
 * called by the update functions for projects, contacts, notebook pages and
 * areas — callers never need to remember it.
 */

import { query } from './index'
import { rebuildAllLinks } from './notebook'
import { SOURCES, rewriteRecords, snippetAround, type TagRef } from './tags'
import { indexOfWikiLink, replaceWikiLink } from '@/lib/wikiLinks'

/**
 * Window event fired after links were rewritten, or a linkable entity was
 * created, renamed, archived or restored, so cached entity lists refresh.
 */
export const LINKS_CHANGED_EVENT = 'myworker:links-changed'

/** Tells open editors their [[link]] suggestions may be out of date. */
export function notifyLinksChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LINKS_CHANGED_EVENT))
}

/** How many linkable entities (of any type) currently carry this name. */
async function countEntitiesNamed(name: string): Promise<number> {
  const rows = await query(
    `SELECT (SELECT COUNT(*) FROM projects WHERE work_item = ?1 COLLATE NOCASE)
          + (SELECT COUNT(*) FROM contacts WHERE name = ?1 COLLATE NOCASE)
          + (SELECT COUNT(*) FROM notebook_pages WHERE title = ?1 COLLATE NOCASE)
          + (SELECT COUNT(*) FROM dropdown_options WHERE type = 'product_area' AND label = ?1 COLLATE NOCASE) AS n`,
    [name],
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Call AFTER an entity was renamed from `oldName` to `newName`: repoints every
 * [[oldName]] link at the new name. Skipped when the links would be ambiguous —
 * another entity still has the old name (the links may be meant for it), or the
 * new name is shared with another entity. Returns the number of records changed.
 */
export async function renameWikiLinks(oldName: string, newName: string): Promise<number> {
  const from = oldName.trim()
  const to = newName.trim()
  if (!from || !to || from === to || from.toLowerCase() === 'untitled') return 0
  if (await countEntitiesNamed(from) > 0) return 0
  if (from.toLowerCase() !== to.toLowerCase() && await countEntitiesNamed(to) > 1) return 0

  const changed = await rewriteRecords(text => replaceWikiLink(text, from, to))
  if (changed > 0) {
    await rebuildAllLinks()
    notifyLinksChanged()
  }
  return changed
}

/**
 * Records whose text links to `name` with a [[wiki link]] — work log entries,
 * tasks, journal entries, projects and contacts. Notebook pages are left out:
 * they are covered by the notebook_links backlink index (getBacklinks).
 * Newest first.
 */
export async function getMentions(name: string): Promise<TagRef[]> {
  const target = name.trim()
  if (!target) return []
  // LIKE narrows the scan in SQL; the regex check below is the real test.
  const like = `%${target.replace(/[\\%_]/g, '\\$&')}%`
  const refs: TagRef[] = []
  for (const src of SOURCES) {
    if (src.type === 'note') continue
    const where = src.textColumns.map(c => `${c} LIKE ?1 ESCAPE '\\'`).join(' OR ')
    const rows = await query(`SELECT * FROM (${src.select}) WHERE ${where}`, [like])
    for (const row of rows) {
      for (const col of src.textColumns) {
        const text = (row[col] as string | null) ?? ''
        const at = indexOfWikiLink(text, target)
        if (at === -1) continue
        refs.push({
          sourceType: src.type,
          id: row.id as number,
          title: (row.title as string) || 'Untitled',
          projectId: (row.project_id as number | null) ?? null,
          inField: false,
          snippet: snippetAround(text, at, target.length + 4),
          date: (row.date as string) ?? '',
        })
        break
      }
    }
  }
  return refs.sort((a, b) => b.date.localeCompare(a.date))
}
