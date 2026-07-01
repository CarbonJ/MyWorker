import { query, run, lastInsertId } from './index'
import type { NotebookPage, NotebookBacklink } from '@/types'

function rowToPage(row: Record<string, unknown>): NotebookPage {
  return {
    id: row.id as number,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getAllNotebookPages(): Promise<NotebookPage[]> {
  const rows = await query(`SELECT * FROM notebook_pages ORDER BY updated_at DESC`)
  return rows.map(rowToPage)
}

export async function getNotebookPageById(id: number): Promise<NotebookPage | null> {
  const rows = await query(`SELECT * FROM notebook_pages WHERE id = ?`, [id])
  return rows.length > 0 ? rowToPage(rows[0]) : null
}

export async function getNotebookPageByTitle(title: string): Promise<NotebookPage | null> {
  const rows = await query(`SELECT * FROM notebook_pages WHERE title = ? LIMIT 1`, [title])
  return rows.length > 0 ? rowToPage(rows[0]) : null
}

export async function createNotebookPage(title: string, body: string): Promise<number> {
  await run(`INSERT INTO notebook_pages (title, body) VALUES (?, ?)`, [title, body])
  return await lastInsertId()
}

export async function updateNotebookPage(id: number, title: string, body: string): Promise<void> {
  await run(`UPDATE notebook_pages SET title = ?, body = ? WHERE id = ?`, [title, body, id])
}

export async function deleteNotebookPage(id: number): Promise<void> {
  await run(`DELETE FROM notebook_pages WHERE id = ?`, [id])
}

// Loads all entity names directly from the DB so it's never dependent on
// component-side state that may not have loaded yet when a save fires.
async function loadAllEntities(): Promise<Array<{ type: string; id: number; name: string }>> {
  const [projects, contacts, areas, pages] = await Promise.all([
    query(`SELECT id, work_item AS name FROM projects WHERE is_archived = 0`),
    query(`SELECT id, name FROM contacts`),
    query(`SELECT id, label AS name FROM dropdown_options WHERE type = 'product_area'`),
    query(`SELECT id, title AS name FROM notebook_pages`),
  ])
  return [
    ...projects.map(r => ({ type: 'project', id: r.id as number, name: r.name as string })),
    ...contacts.map(r => ({ type: 'contact', id: r.id as number, name: r.name as string })),
    ...areas.map(r => ({ type: 'area', id: r.id as number, name: r.name as string })),
    ...pages.map(r => ({ type: 'page', id: r.id as number, name: r.name as string })),
  ]
}

export async function rebuildLinks(pageId: number, body: string): Promise<void> {
  await run(`DELETE FROM notebook_links WHERE source_page_id = ?`, [pageId])
  // tiptap-markdown serializes [ as \[ — normalize before parsing so wiki links
  // stored as \[\[name\]\] are still detected.
  const normalized = body.replace(/\\\[/g, '[').replace(/\\\]/g, ']')
  const pattern = /\[\[([^\]]+)\]\]/g
  const seen = new Set<string>()
  const names: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(normalized)) !== null) {
    const name = match[1].trim()
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      names.push(name)
    }
  }
  if (names.length === 0) return

  const entities = await loadAllEntities()
  for (const name of names) {
    const entity = entities.find(e => e.name.toLowerCase() === name.toLowerCase())
    await run(
      `INSERT OR IGNORE INTO notebook_links (source_page_id, target_type, target_id, target_name) VALUES (?, ?, ?, ?)`,
      [pageId, entity?.type ?? 'unknown', entity?.id ?? null, name]
    )
  }
}

// Re-indexes every page — call once on mount to fix any stale link data.
export async function rebuildAllLinks(): Promise<void> {
  const pages = await getAllNotebookPages()
  for (const page of pages) {
    await rebuildLinks(page.id, page.body)
  }
}

export async function getBacklinks(
  targetType: string,
  targetId: number,
  entityName?: string,
): Promise<NotebookBacklink[]> {
  const rows = await query(
    `SELECT nl.source_page_id, np.title, np.body, np.created_at
     FROM notebook_links nl
     JOIN notebook_pages np ON np.id = nl.source_page_id
     WHERE nl.target_type = ? AND nl.target_id = ?
     ORDER BY np.updated_at DESC`,
    [targetType, targetId]
  )

  if (rows.length > 0 || !entityName) {
    return rows.map(row => ({
      pageId: row.source_page_id as number,
      pageTitle: row.title as string,
      snippet: (row.body as string).replace(/[#*_`[\]\\]/g, '').slice(0, 120),
      createdAt: row.created_at as string,
    }))
  }

  // Fallback: index is empty — scan bodies directly.
  // Try both the raw form [[name]] and the tiptap-markdown escaped form \[\[name\]\].
  const scanRows = await query(
    `SELECT id AS source_page_id, title, body, created_at FROM notebook_pages
     WHERE body LIKE ? OR body LIKE ?
     ORDER BY updated_at DESC`,
    [`%[[${entityName}]]%`, `%\\[\\[${entityName}\\]\\]%`]
  )
  return scanRows.map(row => ({
    pageId: row.source_page_id as number,
    pageTitle: row.title as string,
    snippet: (row.body as string).replace(/[#*_`[\]\\]/g, '').slice(0, 120),
    createdAt: row.created_at as string,
  }))
}
