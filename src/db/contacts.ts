import { query, run, lastInsertId } from './index'
import type { Contact } from '@/types'

function parseTags(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  try {
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as string[]) : []
  } catch {
    return raw.split(',').map(t => t.trim()).filter(Boolean)
  }
}

function stringifyTags(tags: string[]): string {
  return tags.length === 0 ? '' : JSON.stringify(tags)
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as number,
    name: row.name as string,
    role: (row.role as string) ?? '',
    groupName: (row.group_name as string) ?? '',
    notes: (row.notes as string) ?? '',
    tags: parseTags(row.tags as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function getAllContacts(): Promise<Contact[]> {
  const rows = await query(`SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC`)
  return rows.map(rowToContact)
}

export async function getContactById(id: number): Promise<Contact | null> {
  const rows = await query(`SELECT * FROM contacts WHERE id = ?`, [id])
  return rows.length > 0 ? rowToContact(rows[0]) : null
}

export interface CreateContactInput {
  name: string
  role?: string
  groupName?: string
  notes?: string
  tags?: string[]
}

export async function createContact(input: CreateContactInput): Promise<number> {
  await run(
    `INSERT INTO contacts (name, role, group_name, notes, tags)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.name.trim(),
      input.role?.trim() ?? '',
      input.groupName?.trim() ?? '',
      input.notes?.trim() ?? '',
      stringifyTags(input.tags ?? []),
    ],
  )
  return await lastInsertId()
}

export interface UpdateContactInput extends Partial<CreateContactInput> {
  id: number
}

export async function updateContact(input: UpdateContactInput): Promise<void> {
  const rows = await query(`SELECT * FROM contacts WHERE id = ?`, [input.id])
  if (rows.length === 0) throw new Error(`Contact ${input.id} not found`)
  const current = rowToContact(rows[0])

  await run(
    `UPDATE contacts
     SET name = ?, role = ?, group_name = ?, notes = ?, tags = ?
     WHERE id = ?`,
    [
      (input.name ?? current.name).trim(),
      (input.role !== undefined ? input.role : current.role).trim(),
      (input.groupName !== undefined ? input.groupName : current.groupName).trim(),
      (input.notes !== undefined ? input.notes : current.notes).trim(),
      stringifyTags(input.tags !== undefined ? input.tags : current.tags),
      input.id,
    ],
  )
}

export async function deleteContact(id: number): Promise<void> {
  await run(`DELETE FROM contacts WHERE id = ?`, [id])
}

/** All contact names sorted alphabetically — merged into stakeholder autocomplete. */
export async function getAllContactNames(): Promise<string[]> {
  const rows = await query(`SELECT name FROM contacts ORDER BY name COLLATE NOCASE ASC`)
  return rows.map(r => r.name as string)
}
