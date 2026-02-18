import { query, run, lastInsertId } from './index'
import type { DropdownOption, DropdownType } from '@/types'

function rowToOption(row: Record<string, unknown>): DropdownOption {
  return {
    id: row.id as number,
    type: row.type as DropdownType,
    label: row.label as string,
    sortOrder: row.sort_order as number,
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

  await run(
    `INSERT INTO dropdown_options (type, label, sort_order) VALUES (?, ?, ?)`,
    [type, label, order],
  )
  return lastInsertId()
}

export async function updateDropdownOption(
  id: number,
  label: string,
  sortOrder: number,
): Promise<void> {
  await run(
    `UPDATE dropdown_options SET label = ?, sort_order = ? WHERE id = ?`,
    [label, sortOrder, id],
  )
}

export async function deleteDropdownOption(id: number): Promise<void> {
  await run(`DELETE FROM dropdown_options WHERE id = ?`, [id])
}

/** Reorder a list of options by saving new sort_order values */
export async function reorderDropdownOptions(
  orderedIds: number[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await run(
      `UPDATE dropdown_options SET sort_order = ? WHERE id = ?`,
      [i, orderedIds[i]],
    )
  }
}
