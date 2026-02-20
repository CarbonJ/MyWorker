import { query } from './index'

export type SearchSourceType = 'project' | 'task' | 'work_log'

export interface SearchResult {
  sourceType: SearchSourceType
  sourceId: number
  projectId: number
  snippet: string
  rank: number
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
    if (!seen.has(r.projectId)) {
      seen.add(r.projectId)
      ids.push(r.projectId)
    }
  }
  return ids
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
