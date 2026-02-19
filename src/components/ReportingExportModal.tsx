import { useState, useMemo } from 'react'
import type { Project, DropdownOption, WorkLogEntry, Task } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  projects: Project[]
  productAreas: DropdownOption[]
  priorities: DropdownOption[]
  projectStatuses: DropdownOption[]
  allTasks: Task[]
  allWorkLog: WorkLogEntry[]
}

// ── Markdown generation ───────────────────────────────────────────────────────

const RAG_EMOJI: Record<string, string> = { Red: '🔴', Amber: '🟡', Green: '🟢' }

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function buildProjectMd(
  p: Project,
  opts: {
    priorities: DropdownOption[]
    productAreas: DropdownOption[]
    projectStatuses: DropdownOption[]
    allTasks: Task[]
    allWorkLog: WorkLogEntry[]
  },
): string {
  const { priorities, productAreas, projectStatuses, allTasks, allWorkLog } = opts

  const priority = priorities.find(o => o.id === p.priorityId)?.label ?? '—'
  const area = productAreas.find(o => o.id === p.productAreaId)?.label ?? '—'
  const status = projectStatuses.find(o => o.id === p.statusId)?.label ?? '—'
  const rag = `${RAG_EMOJI[p.ragStatus] ?? ''} ${p.ragStatus}`

  const latestLog = allWorkLog.find(e => e.projectId === p.id)
  const logLine = latestLog
    ? `**Latest Update (${fmtDate(latestLog.createdAt.slice(0, 10))}):** ${latestLog.note.replace(/\n/g, ' ')}`
    : null

  const openTasks = allTasks.filter(t => t.projectId === p.id && t.status !== 'done')
  const taskLines = openTasks.map(t => {
    const due = t.dueDate ? ` (Due: ${fmtDate(t.dueDate)})` : ''
    return `- ${t.title}${due}`
  })

  const lines: string[] = []
  lines.push(`## ${p.workItem}`)
  lines.push(`**RAG:** ${rag} | **Priority:** ${priority} | **Area:** ${area} | **Status:** ${status}`)
  lines.push('')
  if (p.latestStatus) {
    lines.push(`**Latest Status:** ${p.latestStatus}`)
    lines.push('')
  }
  if (logLine) {
    lines.push(logLine)
    lines.push('')
  }
  if (openTasks.length > 0) {
    lines.push(`**Open Tasks (${openTasks.length}):**`)
    lines.push(...taskLines)
    lines.push('')
  }

  return lines.join('\n')
}

function downloadMd(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChecklistSection({
  title,
  items,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onExport,
  exportLabel,
}: {
  title: string
  items: { id: string; label: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onExport: () => void
  exportLabel: string
}) {
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="max-h-44 overflow-y-auto rounded-md border divide-y divide-border">
        {items.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground text-center">None available</p>
        )}
        {items.map(item => (
          <label
            key={item.id}
            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
          >
            <Checkbox
              checked={selected.has(item.id)}
              onCheckedChange={() => onToggle(item.id)}
            />
            <span className="text-sm">{item.label}</span>
          </label>
        ))}
      </div>

      <Button
        size="sm"
        variant="outline"
        disabled={selected.size === 0}
        onClick={onExport}
      >
        {exportLabel}
      </Button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReportingExportModal({
  open, onClose, projects, productAreas, priorities, projectStatuses, allTasks, allWorkLog,
}: Props) {
  // By-project selection
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())

  // By-area selection
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set())

  const projectItems = useMemo(
    () => projects.map(p => ({ id: String(p.id), label: p.workItem })),
    [projects],
  )

  const areaItems = useMemo(
    () => productAreas.map(a => ({ id: String(a.id), label: a.label })),
    [productAreas],
  )

  const mdOpts = { priorities, productAreas, projectStatuses, allTasks, allWorkLog }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  const exportByProject = (ids: Set<string>) => {
    const chosen = projects.filter(p => ids.has(String(p.id)))
    const today = new Date().toLocaleDateString()
    const md = `# Project Status Report\n_Generated ${today}_\n\n` +
      chosen.map(p => buildProjectMd(p, mdOpts)).join('\n---\n\n')
    downloadMd(md, `report-projects-${new Date().toISOString().slice(0, 10)}.md`)
  }

  const exportByArea = (ids: Set<string>) => {
    const today = new Date().toLocaleDateString()
    const sections: string[] = [`# Project Status Report by Area\n_Generated ${today}_\n`]
    const chosenAreas = productAreas.filter(a => ids.has(String(a.id)))
    for (const area of chosenAreas) {
      const areaProjects = projects.filter(p => p.productAreaId === area.id)
      if (areaProjects.length === 0) continue
      sections.push(`# ${area.label}\n`)
      sections.push(areaProjects.map(p => buildProjectMd(p, mdOpts)).join('\n---\n\n'))
    }
    // Also include projects with no area if areas without products were selected
    downloadMd(sections.join('\n'), `report-by-area-${new Date().toISOString().slice(0, 10)}.md`)
  }

  const exportAll = () => {
    const today = new Date().toLocaleDateString()
    let md = `# Full Project Status Report\n_Generated ${today}_\n\n`
    // Group by area, then unassigned
    const assigned = new Set<number>()
    for (const area of productAreas) {
      const areaProjects = projects.filter(p => p.productAreaId === area.id)
      if (areaProjects.length === 0) continue
      md += `# ${area.label}\n\n`
      md += areaProjects.map(p => { assigned.add(p.id); return buildProjectMd(p, mdOpts) }).join('\n---\n\n')
      md += '\n\n'
    }
    const unassigned = projects.filter(p => !assigned.has(p.id))
    if (unassigned.length > 0) {
      md += `# (No Area)\n\n`
      md += unassigned.map(p => buildProjectMd(p, mdOpts)).join('\n---\n\n')
    }
    downloadMd(md, `report-all-${new Date().toISOString().slice(0, 10)}.md`)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Report</DialogTitle>
          <DialogDescription>
            Choose which projects or areas to include in the Markdown export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* By Project */}
          <ChecklistSection
            title="By Project"
            items={projectItems}
            selected={selectedProjects}
            onToggle={id => setSelectedProjects(toggle(selectedProjects, id))}
            onSelectAll={() => setSelectedProjects(new Set(projectItems.map(i => i.id)))}
            onDeselectAll={() => setSelectedProjects(new Set())}
            onExport={() => exportByProject(selectedProjects)}
            exportLabel={`Export ${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''}…`}
          />

          <Separator />

          {/* By Product Area */}
          <ChecklistSection
            title="By Product Area"
            items={areaItems}
            selected={selectedAreas}
            onToggle={id => setSelectedAreas(toggle(selectedAreas, id))}
            onSelectAll={() => setSelectedAreas(new Set(areaItems.map(i => i.id)))}
            onDeselectAll={() => setSelectedAreas(new Set())}
            onExport={() => exportByArea(selectedAreas)}
            exportLabel={`Export ${selectedAreas.size} area${selectedAreas.size !== 1 ? 's' : ''}…`}
          />
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={exportAll}>Export All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
