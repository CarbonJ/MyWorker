import { query } from './index'
import type { SQLiteCompatibleType } from './index'
import {
  parseSearchQuery,
  buildFtsMatchExpr,
  SNIPPET_MARK_START,
  SNIPPET_MARK_END,
} from '@/lib/searchQuery'

export type SearchSourceType = 'project' | 'task' | 'work_log' | 'notebook' | 'contact' | 'journal'

export interface SearchResult {
  sourceType: SearchSourceType
  sourceId: number
  projectId: number
  /** Plain-text snippet with SNIPPET_MARK_START/END sentinels around matches. */
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
 * Full-text search across projects, tasks, work log entries, notebook pages,
 * contacts and Daily Digest journal entries.
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
  const ftsQuery = buildFtsMatchExpr(parseSearchQuery(trimmed))
  if (!ftsQuery) return []

  const rows = await query(
    `SELECT
       source_type,
       source_id,
       project_id,
       snippet(fts_index, 0, '${SNIPPET_MARK_START}', '${SNIPPET_MARK_END}', '...', 12) AS snippet,
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
    // Notes, contacts and journal entries don't belong to a project (project_id 0)
    if (!(r.projectId > 0)) continue
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
      snippet(fts_index, 0, '${SNIPPET_MARK_START}', '${SNIPPET_MARK_END}', '...', 16) AS snippet,
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

  const contactIds = results.filter(r => r.sourceType === 'contact').map(r => r.sourceId)
  const contactMap = new Map<number, string>()
  if (contactIds.length > 0) {
    const cRows = await query(
      `SELECT id, name FROM contacts WHERE id IN (${contactIds.map(() => '?').join(', ')})`,
      contactIds,
    )
    cRows.forEach(r => contactMap.set(r.id as number, r.name as string))
  }

  const journalIds = results.filter(r => r.sourceType === 'journal').map(r => r.sourceId)
  const journalMap = new Map<number, string>()
  if (journalIds.length > 0) {
    const jRows = await query(
      `SELECT id, entry_date FROM journal_entries WHERE id IN (${journalIds.map(() => '?').join(', ')})`,
      journalIds,
    )
    jRows.forEach(r => journalMap.set(r.id as number, r.entry_date as string))
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
    if (r.sourceType === 'contact') {
      return { ...r, title: contactMap.get(r.sourceId) ?? 'Contact', projectName: '' }
    }
    if (r.sourceType === 'journal') {
      // title is the entry's YYYY-MM-DD date
      return { ...r, title: journalMap.get(r.sourceId) ?? '', projectName: '' }
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

// Query parsing lives in @/lib/searchQuery (pure, unit-tested).
