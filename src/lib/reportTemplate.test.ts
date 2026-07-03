import { describe, it, expect } from 'vitest'
import { renderTemplate } from './reportTemplate'
import { toLocalDateString } from './utils'
import type { Project, Task, WorkLogEntry, DropdownOption } from '@/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProject(over: Partial<Project> & { id: number; workItem: string }): Project {
  return {
    workDescription: '', ragStatus: 'Green', priorityId: null, latestStatus: '',
    productAreaId: null, statusId: null, stakeholders: [], tags: [], dueDate: null,
    isArchived: false, createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00',
    ...over,
  }
}

function makeTask(over: Partial<Task> & { id: number; title: string; projectId: number | null }): Task {
  return {
    productAreaId: null, description: '', notes: '', status: 'open', priorityId: null,
    tags: [], startDate: null, dueDate: null, createdAt: 'x', updatedAt: 'x',
    preArchiveStatus: null, isRecurring: false,
    ...over,
  }
}

const areas: DropdownOption[] = [
  { id: 10, type: 'product_area', label: 'Ops', sortOrder: 0, color: '' },
  { id: 11, type: 'product_area', label: 'Tech', sortOrder: 1, color: '' },
]
const priorities: DropdownOption[] = [
  { id: 20, type: 'priority', label: 'High', sortOrder: 0, color: '' },
]

const TEMPLATE = `# Report {{date}}
{{INSTRUCTIONS: internal notes that must never appear in output}}

## {{Area}}

### {{workItem}}
- RAG: {{RAG_EMOJI}} {{ragStatus}} / Priority: {{Priority}}
- Latest: {{latestLogNote}}
- Task: {{taskTitle}} ({{taskStatus}})

## Summary
- Total: {{totalProjects}} ({{redCount}} red)
- {{area}}: {{projectCount}} projects
- {{workItem}}: {{overdueTaskCount}} overdue tasks
`

function render(projects: Project[], tasks: Task[] = [], workLog: WorkLogEntry[] = []) {
  return renderTemplate(TEMPLATE, projects, {
    priorities, productAreas: areas, projectStatuses: [],
    allTasks: tasks, allWorkLog: workLog,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('groups projects by area in dropdown sort order, unassigned last', () => {
    const out = render([
      makeProject({ id: 1, workItem: 'NoArea' }),
      makeProject({ id: 2, workItem: 'TechProj', productAreaId: 11 }),
      makeProject({ id: 3, workItem: 'OpsProj', productAreaId: 10 }),
    ])
    const ops = out.indexOf('## Ops')
    const tech = out.indexOf('## Tech')
    const noArea = out.indexOf('## No Area')
    expect(ops).toBeGreaterThan(-1)
    expect(tech).toBeGreaterThan(ops)
    expect(noArea).toBeGreaterThan(tech)
    expect(out).toContain('### OpsProj')
  })

  it('replaces project tokens and strips INSTRUCTIONS blocks', () => {
    const out = render([
      makeProject({ id: 1, workItem: 'Alpha', ragStatus: 'Red', priorityId: 20, productAreaId: 10 }),
    ])
    expect(out).toContain('🔴 Red / Priority: High')
    expect(out).not.toContain('INSTRUCTIONS')
    expect(out).toContain(new Date().toLocaleDateString())
  })

  it('expands the task line once per active task and shows the latest log note', () => {
    const project = makeProject({ id: 1, workItem: 'Alpha', productAreaId: 10 })
    const out = render(
      [project],
      [
        makeTask({ id: 1, title: 'Open task', projectId: 1, status: 'open' }),
        makeTask({ id: 2, title: 'Doing task', projectId: 1, status: 'in_progress' }),
        makeTask({ id: 3, title: 'Done task', projectId: 1, status: 'done' }),
      ],
      [{ id: 1, projectId: 1, note: 'latest note', createdAt: '2026-06-30 10:00:00', isSystem: false }],
    )
    expect(out).toContain('Task: Open task (open)')
    expect(out).toContain('Task: Doing task (in progress)')
    expect(out).not.toContain('Done task')
    expect(out).toContain('Latest: latest note')
  })

  it('computes summary counts, including overdue tasks and red+overdue projects', () => {
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateString(d) })()
    const out = render(
      [
        makeProject({ id: 1, workItem: 'RedLate', ragStatus: 'Red', productAreaId: 10 }),
        makeProject({ id: 2, workItem: 'FineProj', productAreaId: 10 }),
      ],
      [makeTask({ id: 1, title: 'Late', projectId: 1, status: 'open', dueDate: yesterday })],
    )
    expect(out).toContain('Total: 2 (1 red)')
    expect(out).toContain('Ops: 2 projects')
    expect(out).toContain('RedLate: 1 overdue tasks')
  })

  it('leaves unknown tokens untouched for template debugging', () => {
    const out = renderTemplate('## {{Area}}\n### {{workItem}}\n{{noSuchToken}}\n',
      [makeProject({ id: 1, workItem: 'A' })],
      { priorities, productAreas: areas, projectStatuses: [], allTasks: [], allWorkLog: [] })
    expect(out).toContain('{{noSuchToken}}')
  })
})
