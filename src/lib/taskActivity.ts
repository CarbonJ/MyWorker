/** A work log line as the digest sees it. */
interface LogLine {
  projectId: number
  note: string
  createdAt: string
  isSystem: boolean
}

export type CombinedLogLine<T extends LogLine> = T & {
  /** Set when a same-day "▶ Started" line was folded into this "✓ Completed" line. */
  startedAt?: string
}

const STARTED = '▶ Started: '
const COMPLETED = '✓ Completed: '
const REOPENED = '↩ Reopened: '

/** True when `note` is the completed line for `title` (recurring tasks append ". Next due: …"). */
function completes(note: string, title: string): boolean {
  const line = COMPLETED + title
  return note === line || note.startsWith(`${line}. Next due:`)
}

/**
 * Folds each "▶ Started: X" line into the later "✓ Completed: X" line for the
 * same task in the same project, so a task started and finished in the range
 * shows as one "✓ Started & completed: X" line. Only app-written lines are
 * combined; a reopen in between keeps them apart. Input order is preserved.
 */
export function combineStartedCompleted<T extends LogLine>(lines: T[]): CombinedLogLine<T>[] {
  const chronological = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.createdAt.localeCompare(b.line.createdAt) || a.index - b.index)

  // Open "started" lines per project: task title → index into `lines`
  const pending = new Map<number, Map<string, number>>()
  const dropped = new Set<number>()
  const startedAt = new Map<number, string>()

  for (const { line, index } of chronological) {
    if (!line.isSystem) continue
    const open = pending.get(line.projectId) ?? new Map<string, number>()
    pending.set(line.projectId, open)
    if (line.note.startsWith(STARTED)) {
      open.set(line.note.slice(STARTED.length), index)
    } else if (line.note.startsWith(COMPLETED)) {
      for (const [title, startIndex] of open) {
        if (!completes(line.note, title)) continue
        dropped.add(startIndex)
        startedAt.set(index, lines[startIndex].createdAt)
        open.delete(title)
        break
      }
    } else if (line.note.startsWith(REOPENED)) {
      open.delete(line.note.slice(REOPENED.length))
    }
  }

  return lines.flatMap((line, index) => {
    if (dropped.has(index)) return []
    const start = startedAt.get(index)
    if (!start) return [line]
    return [{ ...line, note: '✓ Started & completed: ' + line.note.slice(COMPLETED.length), startedAt: start }]
  })
}
