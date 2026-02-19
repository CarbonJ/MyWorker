import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getArchivedProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'

const COLOR_CLASS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
  green:  'bg-green-100 text-green-700 border-green-200',
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
}

const DOT_CLASS: Record<string, string> = {
  red:    'bg-red-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
}

function pillClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}
function dotClass(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}

export default function ArchiveView() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas] = await Promise.all([
        getArchivedProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
    } catch (err) {
      toast.error(`Failed to load archive: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const labelFor = (opts: DropdownOption[], id: number | null) =>
    opts.find(o => o.id === id)?.label ?? '—'

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b bg-background">
        <h1 className="text-lg font-semibold">Archive</h1>
        <span className="text-sm text-muted-foreground">{projects.length} archived project{projects.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass}>Work Item</th>
              <th className={thClass}>Product Area</th>
              <th className={thClass}>Priority</th>
              <th className={thClass}>RAG</th>
              <th className={thClass}>Latest Status</th>
              <th className={thClass}>Archived</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  No archived projects yet. Mark a project complete to archive it.
                </td>
              </tr>
            )}
            {projects.map(p => {
              const priorityOpt = priorities.find(o => o.id === p.priorityId)
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="hover:bg-accent cursor-pointer transition-colors opacity-75 hover:opacity-100"
                >
                  <td className="px-4 py-3 font-medium text-muted-foreground">{p.workItem}</td>
                  <td className="px-4 py-3 text-muted-foreground">{labelFor(productAreas, p.productAreaId)}</td>
                  <td className="px-4 py-3">
                    {priorityOpt ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(priorityOpt.color)}`}>
                        {priorityOpt.color && <span className={`w-1.5 h-1.5 rounded-full ${dotClass(priorityOpt.color)}`} />}
                        {priorityOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3"><RagBadge status={p.ragStatus as RagStatus} /></td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">{p.latestStatus || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(p.updatedAt + 'Z').toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
