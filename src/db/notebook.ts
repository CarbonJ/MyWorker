import { query, run, lastInsertId } from './index'
import type { NotebookPage, WikiEntity, NotebookBacklink } from '@/types'

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

export async function rebuildLinks(pageId: number, body: string, entities: WikiEntity[]): Promise<void> {
  await run(`DELETE FROM notebook_links WHERE source_page_id = ?`, [pageId])
  const pattern = /\[\[([^\]]+)\]\]/g
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    const name = match[1].trim()
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const entity = entities.find(e => e.name.toLowerCase() === key)
    await run(
      `INSERT OR IGNORE INTO notebook_links (source_page_id, target_type, target_id, target_name) VALUES (?, ?, ?, ?)`,
      [pageId, entity?.type ?? 'unknown', entity?.id ?? null, name]
    )
  }
}

export async function getBacklinks(targetType: string, targetId: number): Promise<NotebookBacklink[]> {
  const rows = await query(
    `SELECT nl.source_page_id, np.title, np.body
     FROM notebook_links nl
     JOIN notebook_pages np ON np.id = nl.source_page_id
     WHERE nl.target_type = ? AND nl.target_id = ?
     ORDER BY np.updated_at DESC`,
    [targetType, targetId]
  )
  return rows.map(row => ({
    pageId: row.source_page_id as number,
    pageTitle: row.title as string,
    snippet: (row.body as string).replace(/[#*_`[\]]/g, '').slice(0, 120),
  }))
}
