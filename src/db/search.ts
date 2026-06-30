import { query } from './index'
import type { SQLiteCompatibleType } from './index'

export type SearchSourceType = 'project' | 'task' | 'work_log' | 'notebook'

export interface SearchResult {
  sourceType: SearchSourceType
  sourceId: number
  projectId: number
  snippet: string
  rank: number
}

export interface EnrichedSearchResult extends SearchResult {
  title: string
  projectName: string
  ragStatus?: string
  areaLabel?: string
  taskStatus?: string
  entryCreatedAt?: string
}

/**
 * Full-text search across projects, tasks, and work log entries.
 *
 * Supports:
 *   - Partial prefix matching: "repo" matches "report", "reporting"
 *   - Multi-word: "risk report" finds entries containing both words
 *   - Results ranked by relevance (FTS5 bm25)
 *
 * The query is automatically formatted for FTS5:
 *   - Each word gets a prefix wildcard appended (word*)
 *   - Words are implicitly ANDed together
 */
export async function searchAll(rawQuery: string): Promise<SearchResult[]> {
  const trimmed = rawQuery.trim()
  if (!trimmed) return []

  // Build FTS5 query: each token becomes a prefix query (e.g. "risk rep*")
  const ftsQuery = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map(token => `${escapeFtsToken(token)}*`)
    .join(' ')

  const rows = await query(
    `SELECT
       source_type,
       source_id,
       project_id,
       snippet(fts_index, 0, '<mark>', '</mark>', '...', 12) AS snippet,
       rank
     FROM fts_index
     WHERE fts_index MATCH ?
     ORDER BY rank
     LIMIT 100`,
    [ftsQuery],
  )

  return rows.map(row => ({
    sourceType: row.source_type as SearchSourceType,
    sourceId: row.source_id as number,
    projectId: row.project_id as number,
    snippet: row.snippet as string,
    rank: row.rank as number,
  }))
}

/**
 * Search and return only the unique matching project IDs, ordered by best rank.
 * Useful for filtering the project list.
 */
export async function searchProjectIds(rawQuery: string): Promise<number[]> {
  const results = await searchAll(rawQuery)
  const seen = new Set<number>()
  const ids: number[] = []
  for (const r of results) {
    if (r.sourceType === 'notebook') continue
    if (!seen.has(r.projectId)) {
      seen.add(r.projectId)
      ids.push(r.projectId)
    }
  }
  return ids
}

/**
 * Advanced search with AND/NOT term parsing and optional source-type scoping.
 *
 * Query syntax:
 *   - Multiple words → all must match (AND): `dog bowl`
 *   - NOT prefix excludes matches: `dog bowl NOT cat`
 *   - Dash shorthand: `dog bowl -cat` (same as NOT cat)
 *   - AND keyword is accepted but implicit: `dog AND bowl NOT cat`
 *
 * Returns enriched results with display metadata (project name, task title,
 * work log timestamp, RAG status, area label) pre-fetched in bulk.
 */
export async function searchEnriched(
  rawQuery: string,
  sourceTypes?: SearchSourceType[],
): Promise<EnrichedSearchResult[]> {
  const trimmed = rawQuery.trim()
  if (!trimmed) return []

  const parsed = parseSearchQuery(trimmed)
  const matchExpr = buildFtsMatchExpr(parsed)
  if (!matchExpr) return []

  let sql = `
    SELECT
      source_type,
      source_id,
      project_id,
      snippet(fts_index, 0, '<mark>', '</mark>', '...', 16) AS snippet,
      rank
    FROM fts_index
    WHERE fts_index MATCH ?
  `
  const params: SQLiteCompatibleType[] = [matchExpr]

  if (sourceTypes && sourceTypes.length > 0) {
    sql += ` AND source_type IN (${sourceTypes.map(() => '?').join(', ')})`
    params.push(...sourceTypes)
  }

  sql += ' ORDER BY rank LIMIT 200'

  const rows = await query(sql, params)
  if (rows.length === 0) return []

  const results: SearchResult[] = rows.map(row => ({
    sourceType: row.source_type as SearchSourceType,
    sourceId: row.source_id as number,
    projectId: row.project_id as number,
    snippet: row.snippet as string,
    rank: row.rank as number,
  }))

  // Bulk-fetch display metadata for all result rows
  const projectIds = [...new Set(
    results
      .filter(r => r.sourceType !== 'notebook')
      .map(r => r.projectId)
      .filter(id => id != null && id > 0),
  )]
  const taskIds = results.filter(r => r.sourceType === 'task').map(r => r.sourceId)
  const workLogIds = results.filter(r => r.sourceType === 'work_log').map(r => r.sourceId)
  const notebookIds = results.filter(r => r.sourceType === 'notebook').map(r => r.sourceId)

  const projectMap = new Map<number, Record<string, SQLiteCompatibleType>>()
  if (projectIds.length > 0) {
    const pRows = await query(
      `SELECT p.id, p.work_item, p.rag_status, d.label AS area_label
       FROM projects p
       LEFT JOIN dropdown_options d ON d.id = p.product_area_id
       WHERE p.id IN (${projectIds.map(() => '?').join(', ')})`,
      projectIds,
    )
    pRows.forEach(r => projectMap.set(r.id as number, r))
  }

  const taskMap = new Map<number, Record<string, SQLiteCompatibleType>>()
  if (taskIds.length > 0) {
    const tRows = await query(
      `SELECT id, title, status FROM tasks WHERE id IN (${taskIds.map(() => '?').join(', ')})`,
      taskIds,
    )
    tRows.forEach(r => taskMap.set(r.id as number, r))
  }

  const wlMap = new Map<number, Record<string, SQLiteCompatibleType>>()
  if (workLogIds.length > 0) {
    const wRows = await query(
      `SELECT id, created_at FROM work_log_entries WHERE id IN (${workLogIds.map(() => '?').join(', ')})`,
      workLogIds,
    )
    wRows.forEach(r => wlMap.set(r.id as number, r))
  }

  const notebookMap = new Map<number, string>()
  if (notebookIds.length > 0) {
    const nbRows = await query(
      `SELECT id, title FROM notebook_pages WHERE id IN (${notebookIds.map(() => '?').join(', ')})`,
      notebookIds,
    )
    nbRows.forEach(r => notebookMap.set(r.id as number, r.title as string))
  }

  return results.map(r => {
    const proj = projectMap.get(r.projectId)
    const projectName = (proj?.work_item as string) ?? ''

    if (r.sourceType === 'project') {
      return {
        ...r,
        title: projectName,
        projectName,
        ragStatus: (proj?.rag_status as string) ?? undefined,
        areaLabel: (proj?.area_label as string) || undefined,
      }
    }
    if (r.sourceType === 'task') {
      const task = taskMap.get(r.sourceId)
      return {
        ...r,
        title: (task?.title as string) ?? '',
        projectName,
        taskStatus: (task?.status as string) ?? undefined,
      }
    }
    if (r.sourceType === 'notebook') {
      return {
        ...r,
        title: notebookMap.get(r.sourceId) ?? 'Notebook Page',
        projectName: '',
      }
    }
    // work_log
    const wl = wlMap.get(r.sourceId)
    return {
      ...r,
      title: (wl?.created_at as string) ?? '',
      projectName,
      entryCreatedAt: (wl?.created_at as string) ?? undefined,
    }
  })
}

/**
 * Parse a user-facing search string into include and exclude term lists.
 *
 * Syntax:
 *   - Words → include (must all match)
 *   - NOT word  → exclude
 *   - -word     → exclude (dash shorthand)
 *   - AND       → ignored (explicit AND is implicit by default)
 */
export function parseSearchQuery(raw: string): { include: string[]; exclude: string[] } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const include: string[] = []
  const exclude: string[] = []

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.toUpperCase() === 'NOT') {
      if (i + 1 < tokens.length) {
        const term = escapeFtsToken(tokens[i + 1])
        if (term) exclude.push(term)
        i += 2
      } else {
        i++
      }
    } else if (t.startsWith('-') && t.length > 1) {
      const term = escapeFtsToken(t.slice(1))
      if (term) exclude.push(term)
      i++
    } else if (t.toUpperCase() === 'AND') {
      i++
    } else {
      const term = escapeFtsToken(t)
      if (term) include.push(term)
      i++
    }
  }

  return { include, exclude }
}

function buildFtsMatchExpr(parsed: { include: string[]; exclude: string[] }): string | null {
  if (parsed.include.length === 0) return null
  const parts = parsed.include.map(t => `${t}*`)
  if (parsed.exclude.length > 0) {
    parts.push(...parsed.exclude.map(t => `NOT ${t}*`))
  }
  return parts.join(' ')
}

/**
 * Strip FTS5 special characters from a single search token.
 *
 * Why strip rather than quote/escape: FTS5 supports wrapping tokens in double
 * quotes to treat them as literals, but quoted tokens cannot carry the trailing
 * `*` wildcard needed for prefix matching ("repo"* is a syntax error). Stripping
 * the handful of special characters (`"`, `^`, `*`, `:`, `.`) is simpler and
 * covers all realistic user input — these characters have no meaningful search
 * value in this app's content anyway.
 */
function escapeFtsToken(token: string): string {
  return token.replace(/["^*:.]/g, '')
}
