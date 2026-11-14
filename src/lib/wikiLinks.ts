/**
 * [[Wiki link]] text helpers (pure — no database access).
 *
 * Links are stored as plain text and matched to entities by name,
 * case-insensitively. The editor's markdown serializer may write the brackets
 * escaped (\[\[Name\]\]), so both spellings are handled everywhere.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkRegExp(name: string): RegExp {
  return new RegExp(`(\\\\?\\[\\\\?\\[)\\s*${escapeRegExp(name.trim())}\\s*(\\\\?\\]\\\\?\\])`, 'gi')
}

/** Offset of the first [[name]] link in `text`, or -1. */
export function indexOfWikiLink(text: string, name: string): number {
  return text.search(linkRegExp(name))
}

/** Point every [[oldName]] link in `text` at `newName`, keeping each link's bracket style. */
export function replaceWikiLink(text: string, oldName: string, newName: string): string {
  if (!text.includes('[')) return text
  return text.replace(linkRegExp(oldName), (_, open: string, close: string) => `${open}${newName}${close}`)
}
