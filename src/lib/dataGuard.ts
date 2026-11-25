/**
 * Mass-loss guard (pure logic — see persistNow() in db/index.ts).
 *
 * Before each folder save the app compares how many records it is about to
 * write with how many the last save wrote. Records moved to the Trash still
 * count, so an ordinary delete never trips the guard; a large unexplained drop
 * (a bad import, a bug, an emptied table) does, and saving pauses until the
 * user decides.
 */

/** Tables whose records are guarded, by their key in the backup file. */
export const GUARDED_TABLES: { key: string; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'workLogEntries', label: 'Work log entries' },
  { key: 'notebookPages', label: 'Notes' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'journalEntries', label: 'Journal entries' },
]

/** Record counts per guarded table, plus `inTrash` (records held in the Trash). */
export type RecordCounts = Record<string, number>

/** A drop is "large" when at least this many records are gone… */
const MIN_LOST = 25
/** …and they are at least this share of everything there was. */
const MIN_LOST_SHARE = 0.1
/** A table with at least this many records that becomes empty is always a large drop. */
const EMPTIED_MIN = 5

export interface DataDrop {
  /** Records gone, Trash included. */
  lost: number
  before: number
  after: number
  /** Guarded tables whose live count fell, with their counts. */
  tables: { key: string; label: string; before: number; after: number }[]
}

/** Records a trash row holds: the item itself, plus a project's tasks and log entries. */
function trashRecords(row: unknown): number {
  try {
    const payload = JSON.parse(String((row as { payload?: unknown }).payload ?? '{}'))
    return 1 + (payload.tasks?.length ?? 0) + (payload.workLogEntries?.length ?? 0)
  } catch {
    return 1
  }
}

/** Counts for a backup-format data object (as written to the folder file). */
export function countRecords(data: Record<string, unknown>): RecordCounts {
  const counts: RecordCounts = {}
  for (const { key } of GUARDED_TABLES) counts[key] = Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0
  counts.inTrash = Array.isArray(data.trash) ? (data.trash as unknown[]).reduce<number>((n, r) => n + trashRecords(r), 0) : 0
  return counts
}

const total = (c: RecordCounts) => GUARDED_TABLES.reduce((n, { key }) => n + (c[key] ?? 0), 0) + (c.inTrash ?? 0)

/** The drop from `before` to `after` when it is large enough to stop for, else null. */
export function assessDrop(before: RecordCounts, after: RecordCounts): DataDrop | null {
  const b = total(before)
  const a = total(after)
  const lost = b - a
  const emptied = GUARDED_TABLES.some(({ key }) => (before[key] ?? 0) >= EMPTIED_MIN && (after[key] ?? 0) === 0)
  const large = lost >= MIN_LOST && lost >= b * MIN_LOST_SHARE
  if (!emptied && !large) return null
  return {
    lost: Math.max(0, lost),
    before: b,
    after: a,
    tables: GUARDED_TABLES
      .filter(({ key }) => (after[key] ?? 0) < (before[key] ?? 0))
      .map(({ key, label }) => ({ key, label, before: before[key] ?? 0, after: after[key] ?? 0 })),
  }
}
