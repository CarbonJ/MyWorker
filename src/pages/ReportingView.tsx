import { useEffect, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'

type SortKey = 'ragStatus' | 'workItem' | 'productArea' | 'priority' | 'latestStatus'
type SortDir = 'asc' | 'desc'

const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

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

function priorityClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function priorityDot(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}

export default function ReportingView() {
  const [projects, setProjects] = useState<Project[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('ragStatus')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
    } catch (err) {
      console.error('Failed to load projects', err)
      toast.error(`Failed to load projects: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const labelFor = (opts: DropdownOption[], id: number | null) =>
    opts.find(o => o.id === id)?.label ?? '—'

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'ragStatus': av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
        case 'workItem': av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
        case 'productArea': av = labelFor(productAreas, a.productAreaId).toLowerCase(); bv = labelFor(productAreas, b.productAreaId).toLowerCase(); break
        case 'priority': av = labelFor(priorities, a.priorityId).toLowerCase(); bv = labelFor(priorities, b.priorityId).toLowerCase(); break
        case 'latestStatus': av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [projects, sortKey, sortDir, priorities, productAreas])

  const SortIcon = ({ col }: { col: SortKey }) =>
    <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Reporting</h1>
          <p className="text-xs text-muted-foreground">{projects.length} projects · read-only</p>
        </div>
        <button
          onClick={load}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass} onClick={() => handleSort('ragStatus')}>RAG<SortIcon col="ragStatus" /></th>
              <th className={thClass} onClick={() => handleSort('workItem')}>Work Item<SortIcon col="workItem" /></th>
              <th className={thClass} onClick={() => handleSort('productArea')}>Product Area<SortIcon col="productArea" /></th>
              <th className={thClass} onClick={() => handleSort('priority')}>Priority<SortIcon col="priority" /></th>
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Latest Status<SortIcon col="latestStatus" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No projects yet.
                </td>
              </tr>
            )}
            {sorted.map(p => (
              <tr key={p.id} className="hover:bg-accent/50">
                <td className="px-3 py-2"><RagBadge status={p.ragStatus} /></td>
                <td className="px-3 py-2 font-medium">{p.workItem}</td>
                <td className="px-3 py-2 text-muted-foreground">{labelFor(productAreas, p.productAreaId)}</td>
                <td className="px-3 py-2">
                  {p.priorityId ? (() => {
                    const opt = priorities.find(o => o.id === p.priorityId)
                    const color = opt?.color ?? ''
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${priorityClass(color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityDot(color)}`} />
                        {opt?.label ?? '—'}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.latestStatus || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
