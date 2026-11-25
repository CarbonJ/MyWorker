/**
 * [[Wiki link]] text helpers (pure — no database access).
 *
 * Links are stored as plain text and matched to entities by name. Every place
 * that resolves a link (editor colouring, read-only text, backlinks, renames)
 * compares names through wikiLinkKey(), so they always agree on whether a link
 * is live. The key forgives what the editor and markdown round trip can change
 * without the user noticing: letter case, runs of spaces, markdown escapes
 * (\[\[Name\]\], A\_B), HTML entities (&lt;) and smart punctuation (– — ’ “).
 */

/** Comparison key for a link target or entity name. */
export function wikiLinkKey(name: string): string {
  return name
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]|--/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The entity a link points to, or undefined when no entity has that name. */
export function findWikiEntity<T extends { name: string }>(entities: readonly T[], linkName: string): T | undefined {
  const key = wikiLinkKey(linkName)
  return key ? entities.find(e => wikiLinkKey(e.name) === key) : undefined
}

export interface WikiLinkMatch {
  /** Offset of the opening bracket in the text. */
  index: number
  /** Length of the whole link, brackets included. */
  length: number
  /** The link text between the brackets, as written. */
  name: string
  /** The opening and closing brackets, as written ([[ or \[\[). */
  open: string
  close: string
}

// [[Name]] or the escaped \[\[Name\]\] the editor's markdown serializer may write
const LINK_RE = /(\\?\[\\?\[)([^\n]+?)(\\?\]\\?\])/g

/** Every [[link]] in `text`, in order. */
export function findWikiLinks(text: string): WikiLinkMatch[] {
  if (!text.includes('[')) return []
  const out: WikiLinkMatch[] = []
  for (const m of text.matchAll(LINK_RE)) {
    if (!m[2].trim()) continue
    out.push({ index: m.index, length: m[0].length, name: m[2], open: m[1], close: m[3] })
  }
  return out
}

/** Offset of the first [[name]] link in `text`, or -1. */
export function indexOfWikiLink(text: string, name: string): number {
  const key = wikiLinkKey(name)
  return findWikiLinks(text).find(l => wikiLinkKey(l.name) === key)?.index ?? -1
}

/** Point every [[oldName]] link in `text` at `newName`, keeping each link's bracket style. */
export function replaceWikiLink(text: string, oldName: string, newName: string): string {
  const key = wikiLinkKey(oldName)
  const links = findWikiLinks(text).filter(l => wikiLinkKey(l.name) === key)
  // Back to front so earlier offsets stay valid
  for (const l of links.reverse()) {
    text = text.slice(0, l.index) + l.open + newName + l.close + text.slice(l.index + l.length)
  }
  return text
}

/** Turn every [[name]] link in `text` back into the plain words it contains. */
export function unlinkWikiLink(text: string, name: string): string {
  const key = wikiLinkKey(name)
  const links = findWikiLinks(text).filter(l => wikiLinkKey(l.name) === key)
  for (const l of links.reverse()) {
    text = text.slice(0, l.index) + l.name.trim() + text.slice(l.index + l.length)
  }
  return text
}
