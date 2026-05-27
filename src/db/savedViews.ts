import { query, run } from './index'

export async function getSavedViewsForPage(
  page: string,
): Promise<{ name: string; data: string }[]> {
  const rows = await query(
    `SELECT name, data FROM saved_views WHERE page = ? ORDER BY created_at ASC`,
    [page],
  )
  return rows.map(r => ({ name: r.name as string, data: r.data as string }))
}

export async function upsertSavedView(
  page: string,
  name: string,
  data: string,
): Promise<void> {
  await run(
    `INSERT INTO saved_views (page, name, data) VALUES (?, ?, ?)
     ON CONFLICT(page, name) DO UPDATE SET data = excluded.data`,
    [page, name, data],
  )
}

export async function deleteSavedView(page: string, name: string): Promise<void> {
  await run(`DELETE FROM saved_views WHERE page = ? AND name = ?`, [page, name])
}
