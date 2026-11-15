/**
 * Tag (de)serialisation — tags are stored in the database as a JSON array
 * string, or '' when empty. Shared by projects, tasks and contacts, which
 * previously each carried their own copy of these functions.
 */

/**
 * Parse a stored tags value into a string array.
 * `legacyCommaFallback` treats unparseable values as a comma-separated list
 * (used by contacts, whose early data predates the JSON format).
 */
export function parseTags(raw: string, legacyCommaFallback = false): string[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    if (legacyCommaFallback) {
      return raw.split(',').map(t => t.trim()).filter(Boolean)
    }
    return []
  }
}

export function stringifyTags(tags: string[]): string {
  return tags.length === 0 ? '' : JSON.stringify(tags)
}

// ── Inline #hashtags ──────────────────────────────────────────────────────────
// Tags can also be written inline in any markdown text (work log, task notes,
// notebook pages, …) as #tag. A hashtag starts with a letter and may contain
// letters, digits, "-", "_" and "/". Tag identity is case-insensitive.

export interface HashtagMatch {
  /** Offset of the "#" in the text. */
  index: number
  /** Length of the whole token including the "#". */
  length: number
  /** Tag name without the "#" (markdown escapes removed). */
  name: string
}

/** Case-insensitive identity of a tag name ("Audit" and "audit" are one tag). */
export function tagKey(name: string): string {
  return name.trim().toLowerCase()
}

/** True when `name` can be written inline as #name. */
export function isHashtagName(name: string): boolean {
  return /^\p{L}[\p{L}\p{N}_/-]*$/u.test(name) && !/[-_/]$/.test(name)
}

// "#" must start the text or follow whitespace/opening punctuation, so URL
// anchors (page#section) and mid-word hashes never match. "\_" is how the
// editor's markdown serializer writes an underscore.
const HASHTAG_RE = /(^|[\s([{>"',;])#(\p{L}(?:[\p{L}\p{N}/-]|\\?_)*)/gu

// Markdown regions where a "#word" is not a tag: code, links/images, wiki links, bare URLs.
const SKIP_RE = /```[\s\S]*?```|`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|\\?\[\\?\[[^\]\n]*\]\\?\]|https?:\/\/\S+/g

// Common English words that happen to be valid 3-digit hex colours; these stay tags.
const HEX_WORDS = new Set(['ace', 'add', 'bad', 'bed', 'bee', 'cab', 'dab', 'dad', 'ebb', 'fab', 'fad', 'fed', 'fee'])

/**
 * True for CSS hex colours written with a "#": #fff, #a1b2c3, #a1b2c3ff.
 * Hex digits only, 3, 6 or 8 long — except a few real words like #bad or #add.
 */
export function isHexColour(name: string): boolean {
  if (!/^[0-9a-f]+$/i.test(name)) return false
  if (name.length === 3) return !HEX_WORDS.has(name.toLowerCase())
  return name.length === 6 || name.length === 8
}

/**
 * Find every #hashtag in `text`. With `markdown` (default) the text is treated
 * as markdown source and code/link regions are skipped; pass false for plain
 * text such as an editor text node.
 */
export function findHashtags(text: string, markdown = true): HashtagMatch[] {
  if (!text || !text.includes('#')) return []
  const skip: [number, number][] = []
  if (markdown) {
    for (const m of text.matchAll(SKIP_RE)) skip.push([m.index, m.index + m[0].length])
  }
  const found: HashtagMatch[] = []
  for (const m of text.matchAll(HASHTAG_RE)) {
    // Trailing separators belong to the sentence, not the tag ("#risk-" → "risk")
    const raw = m[2].replace(/(?:[-/]|\\?_)+$/, '')
    const index = m.index + m[1].length
    if (skip.some(([a, b]) => index >= a && index < b)) continue
    const name = raw.replace(/\\/g, '')
    if (isHexColour(name)) continue
    found.push({ index, length: raw.length + 1, name })
  }
  return found
}

/** Distinct tag names used inline in `text` (first spelling of each wins). */
export function extractHashtags(text: string): string[] {
  const seen = new Map<string, string>()
  for (const { name } of findHashtags(text)) {
    if (!seen.has(tagKey(name))) seen.set(tagKey(name), name)
  }
  return [...seen.values()]
}

/**
 * Rewrite every inline occurrence of the tag `name` in markdown `text`.
 * `replacement` is the new tag name, or null to remove the "#" and leave the
 * word as plain text. Returns the text unchanged when the tag isn't present.
 */
export function replaceHashtag(text: string, name: string, replacement: string | null): string {
  const key = tagKey(name)
  const hits = findHashtags(text).filter(h => tagKey(h.name) === key)
  let out = text
  for (const h of hits.reverse()) {
    const next = replacement === null ? h.name : `#${replacement}`
    out = out.slice(0, h.index) + next + out.slice(h.index + h.length)
  }
  return out
}

/**
 * Replace (or with null, remove) a tag in a tag list, matching case-insensitively
 * and collapsing any duplicate the rename creates.
 */
export function replaceInTagList(tags: string[], name: string, replacement: string | null): string[] {
  const key = tagKey(name)
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tags) {
    const next = tagKey(t) === key ? replacement : t
    if (next === null || seen.has(tagKey(next))) continue
    seen.add(tagKey(next))
    out.push(next)
  }
  return out
}

/**
 * Every tag on a record: its tag field plus any #tags written inline in its
 * text fields, de-duplicated case-insensitively (first spelling wins).
 */
export function collectTags(fieldTags: string[], ...texts: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  const add = (name: string) => {
    const key = tagKey(name)
    if (key && !seen.has(key)) seen.set(key, name.trim())
  }
  fieldTags.forEach(add)
  for (const text of texts) if (text) extractHashtags(text).forEach(add)
  return [...seen.values()]
}
