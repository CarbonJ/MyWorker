import { useState, useMemo } from 'react'
import type { Project, DropdownOption, WorkLogEntry, Task } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { renderTemplate } from '@/lib/reportTemplate'
import briefTemplateRaw from '@/templates/report-brief.md?raw'
import detailedTemplateRaw from '@/templates/report-detailed.md?raw'

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
  exportFormat: 'brief' | 'detailed'
  onExportFormatChange: (fmt: 'brief' | 'detailed') => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function template(format: 'brief' | 'detailed'): string {
  return format === 'brief' ? briefTemplateRaw : detailedTemplateRaw
}

async function copyToClipboard(content: string, setCopied: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch { /* silent fail — download still works */ }
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
  onCopy,
}: {
  title: string
  items: { id: string; label: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onExport: () => void
  exportLabel: string
  onCopy?: () => void
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

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={onExport}
        >
          {exportLabel}
        </Button>
        {onCopy && (
          <Button
            size="sm"
            variant="ghost"
            disabled={selected.size === 0}
            onClick={onCopy}
          >
            Copy
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReportingExportModal({
  open, onClose, projects, productAreas, priorities, projectStatuses, allTasks, allWorkLog,
  exportFormat, onExportFormatChange,
}: Props) {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set())
  const [clipboardCopied, setClipboardCopied] = useState(false)

  const renderOpts = { priorities, productAreas, projectStatuses, allTasks, allWorkLog }
  const tmpl = template(exportFormat)
  const date = new Date().toISOString().slice(0, 10)

  const projectItems = useMemo(
    () => projects.map(p => ({ id: String(p.id), label: p.workItem })),
    [projects],
  )
  const areaItems = useMemo(
    () => productAreas.map(a => ({ id: String(a.id), label: a.label })),
    [productAreas],
  )

  // ── Build functions ────────────────────────────────────────────────────────

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }

  const buildByProject = (ids: Set<string>) => {
    const chosen = projects.filter(p => ids.has(String(p.id)))
    return renderTemplate(tmpl, chosen, renderOpts)
  }

  const buildByArea = (ids: Set<string>) => {
    const chosenAreaIds = new Set(productAreas.filter(a => ids.has(String(a.id))).map(a => a.id))
    const chosen = projects.filter(p => p.productAreaId !== null && chosenAreaIds.has(p.productAreaId))
    return renderTemplate(tmpl, chosen, renderOpts)
  }

  const buildAll = () => renderTemplate(tmpl, projects, renderOpts)

  // ── Export / copy handlers ─────────────────────────────────────────────────

  const exportByProject = () =>
    downloadMd(buildByProject(selectedProjects), `report-projects-${exportFormat}-${date}.md`)
  const exportByArea = () =>
    downloadMd(buildByArea(selectedAreas), `report-by-area-${exportFormat}-${date}.md`)
  const exportAll = () =>
    downloadMd(buildAll(), `report-all-${exportFormat}-${date}.md`)

  const copyByProject = () => copyToClipboard(buildByProject(selectedProjects), setClipboardCopied)
  const copyByArea    = () => copyToClipboard(buildByArea(selectedAreas), setClipboardCopied)
  const copyAll       = () => copyToClipboard(buildAll(), setClipboardCopied)

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
          {/* Format toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Format:</span>
            <div className="flex rounded-md border overflow-hidden">
              {(['brief', 'detailed'] as const).map(fmt => (
                <button key={fmt} type="button"
                  className={`px-3 py-1 text-xs capitalize ${exportFormat === fmt ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                  onClick={() => onExportFormatChange(fmt)}
                >
                  {fmt === 'brief' ? 'Brief (one-liner)' : 'Detailed'}
                </button>
              ))}
            </div>
          </div>

          {/* By Project */}
          <ChecklistSection
            title="By Project"
            items={projectItems}
            selected={selectedProjects}
            onToggle={id => setSelectedProjects(toggle(selectedProjects, id))}
            onSelectAll={() => setSelectedProjects(new Set(projectItems.map(i => i.id)))}
            onDeselectAll={() => setSelectedProjects(new Set())}
            onExport={exportByProject}
            exportLabel={`Export ${selectedProjects.size} project${selectedProjects.size !== 1 ? 's' : ''}…`}
            onCopy={copyByProject}
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
            onExport={exportByArea}
            exportLabel={`Export ${selectedAreas.size} area${selectedAreas.size !== 1 ? 's' : ''}…`}
            onCopy={copyByArea}
          />
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={copyAll}>{clipboardCopied ? '✓ Copied' : 'Copy All'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={exportAll}>Export All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
