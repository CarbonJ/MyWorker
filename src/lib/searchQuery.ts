/**
 * FTS5 query construction — pure functions with no database dependency,
 * extracted from db/search.ts so they can be unit-tested without loading
 * the wa-sqlite WASM stack.
 */

/**
 * Sentinel characters wrapping matched terms in FTS5 snippet() output.
 * The snippet is plain text (never HTML) — the UI splits on these sentinels
 * and renders highlights as React elements, so stored content can't inject
 * markup into the page.
 */
export const SNIPPET_MARK_START = '\x01'
export const SNIPPET_MARK_END = '\x02'

/**
 * Split a raw word into FTS5-safe bareword tokens.
 *
 * FTS5 treats most punctuation as query syntax — `c++`, `foo(bar` or `a:b`
 * are syntax errors as barewords and previously made the whole search throw
 * (surfacing as silently-empty results). The porter/ascii tokenizer splits
 * indexed text on punctuation anyway, so splitting the query token the same
 * way preserves matching behaviour: searching `foo(bar` matches text
 * containing "foo" and "bar".
 */
function toFtsTokens(word: string): string[] {
  return word.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
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
        exclude.push(...toFtsTokens(tokens[i + 1]))
        i += 2
      } else {
        i++
      }
    } else if (t.startsWith('-') && t.length > 1) {
      exclude.push(...toFtsTokens(t.slice(1)))
      i++
    } else if (t.toUpperCase() === 'AND') {
      i++
    } else {
      include.push(...toFtsTokens(t))
      i++
    }
  }

  return { include, exclude }
}

/**
 * Build an FTS5 MATCH expression from parsed terms.
 * Include terms get a prefix wildcard and are implicitly ANDed;
 * exclude terms are appended as NOT clauses.
 * Returns null when there is nothing to search for.
 */
export function buildFtsMatchExpr(parsed: { include: string[]; exclude: string[] }): string | null {
  if (parsed.include.length === 0) return null
  const parts = parsed.include.map(t => `${t}*`)
  if (parsed.exclude.length > 0) {
    parts.push(...parsed.exclude.map(t => `NOT ${t}*`))
  }
  return parts.join(' ')
}
