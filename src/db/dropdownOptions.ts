import { query, run, insert, exec, getDb, persistToUserFolder } from './index'
import { notifyLinksChanged, renameWikiLinks } from './links'
import type { DropdownOption, DropdownType } from '@/types'

function rowToOption(row: Record<string, unknown>): DropdownOption {
  return {
    id: row.id as number,
    type: row.type as DropdownType,
    label: row.label as string,
    sortOrder: row.sort_order as number,
    color: (row.color as string) ?? '',
  }
}

export async function getDropdownOptions(type: DropdownType): Promise<DropdownOption[]> {
  const rows = await query(
    `SELECT * FROM dropdown_options WHERE type = ? ORDER BY sort_order ASC, label ASC`,
    [type],
  )
  return rows.map(rowToOption)
}

export async function getAllDropdownOptions(): Promise<DropdownOption[]> {
  const rows = await query(
    `SELECT * FROM dropdown_options ORDER BY type ASC, sort_order ASC, label ASC`,
  )
  return rows.map(rowToOption)
}

export async function createDropdownOption(
  type: DropdownType,
  label: string,
  sortOrder?: number,
): Promise<number> {
  // Default sort order = end of list
  let order = sortOrder
  if (order === undefined) {
    const rows = await query(
      `SELECT MAX(sort_order) as max_order FROM dropdown_options WHERE type = ?`,
      [type],
    )
    order = ((rows[0]?.max_order as number | null) ?? -1) + 1
  }

  const id = await insert(
    `INSERT INTO dropdown_options (type, label, sort_order) VALUES (?, ?, ?)`,
    [type, label, order],
  )
  // Areas can be [[linked]]
  if (type === 'product_area') notifyLinksChanged()
  return id
}

export async function updateDropdownOption(
  id: number,
  label: string,
  sortOrder: number,
  color?: string,
): Promise<void> {
  const before = await query(`SELECT type, label FROM dropdown_options WHERE id = ?`, [id])
  await run(
    `UPDATE dropdown_options SET label = ?, sort_order = ?, color = ? WHERE id = ?`,
    [label, sortOrder, color ?? '', id],
  )
  // Areas can be [[linked]] — keep those links working after a rename
  if (before[0]?.type === 'product_area' && before[0].label !== label) {
    await renameWikiLinks(before[0].label as string, label)
    notifyLinksChanged()
  }
}

export async function deleteDropdownOption(id: number): Promise<void> {
  await run(`DELETE FROM dropdown_options WHERE id = ?`, [id])
  notifyLinksChanged()
}

/** Count how many projects (archived ones included — deleting clears it on them too) and tasks reference a dropdown option. */
export async function getOptionUsageCount(id: number, type: DropdownType): Promise<number> {
  let n = 0
  if (type === 'priority') {
    const [pr, ta] = await Promise.all([
      query(`SELECT COUNT(*) as n FROM projects WHERE priority_id = ?`, [id]),
      query(`SELECT COUNT(*) as n FROM tasks WHERE priority_id = ?`, [id]),
    ])
    n = Number((pr[0] as Record<string, unknown>).n) + Number((ta[0] as Record<string, unknown>).n)
  } else if (type === 'product_area') {
    const [pr, ta] = await Promise.all([
      query(`SELECT COUNT(*) as n FROM projects WHERE product_area_id = ?`, [id]),
      query(`SELECT COUNT(*) as n FROM tasks WHERE product_area_id = ?`, [id]),
    ])
    n = Number((pr[0] as Record<string, unknown>).n) + Number((ta[0] as Record<string, unknown>).n)
  } else if (type === 'project_status') {
    const [pr] = await Promise.all([
      query(`SELECT COUNT(*) as n FROM projects WHERE status_id = ?`, [id]),
    ])
    n = Number((pr[0] as Record<string, unknown>).n)
  }
  return n
}

/** Reorder a list of options by saving new sort_order values.
 *  All updates run inside a transaction — if any step fails, the
 *  database rolls back to its original state automatically. */
export async function reorderDropdownOptions(
  orderedIds: number[],
): Promise<void> {
  const { sqlite, db } = getDb()
  await exec(sqlite, db, 'BEGIN')
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await exec(sqlite, db,
        `UPDATE dropdown_options SET sort_order = ? WHERE id = ?`,
        [i, orderedIds[i]],
      )
    }
    await exec(sqlite, db, 'COMMIT')
  } catch (err) {
    await exec(sqlite, db, 'ROLLBACK')
    throw err
  }
  await persistToUserFolder()
}
