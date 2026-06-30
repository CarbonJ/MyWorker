export type RagStatus = 'Red' | 'Amber' | 'Green'

export interface Stakeholder {
  name: string
}

export interface Contact {
  id: number
  name: string
  role: string
  groupName: string
  notes: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** True when only the name field is populated — all other fields are empty. */
export function isStubContact(c: Contact): boolean {
  return !c.role && !c.groupName && !c.notes && c.tags.length === 0
}
export type TaskStatus = 'open' | 'in_progress' | 'done'
export type DropdownType = 'priority' | 'product_area' | 'project_status'

export interface Project {
  id: number
  workItem: string
  workDescription: string
  ragStatus: RagStatus
  priorityId: number | null
  latestStatus: string
  productAreaId: number | null
  statusId: number | null
  stakeholders: Stakeholder[]
  tags: string[]
  dueDate: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkLogEntry {
  id: number
  projectId: number
  note: string
  createdAt: string
}

export interface Task {
  id: number
  projectId: number | null
  /** Direct area association — only meaningful when projectId is null.
   *  When projectId is set, the effective area is inherited from the project. */
  productAreaId: number | null
  title: string
  description: string
  notes: string
  status: TaskStatus
  priorityId: number | null
  tags: string[]
  startDate: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  preArchiveStatus: TaskStatus | null
  isRecurring: boolean
}

export interface DropdownOption {
  id: number
  type: DropdownType
  label: string
  sortOrder: number
  color: string
}
