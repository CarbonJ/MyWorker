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
