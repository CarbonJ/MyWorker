import { useEffect, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllTasks } from '@/db/tasks'
import { getAllWorkLogEntries } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { ReportingExportModal } from '@/components/ReportingExportModal'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type SortKey = 'ragStatus' | 'workItem' | 'productArea' | 'priority' | 'latestStatus' | 'projectStatus' | 'openTasks'
type SortDir = 'asc' | 'desc'

const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

const COLOR_CLASS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
  green:  'bg-green-100 text-green-700 border-green-200',
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  grey:   'bg-slate-100 text-slate-600 border-slate-200',
}

const DOT_CLASS: Record<string, string> = {
  red:    'bg-red-500',
  orange: 'bg-orange-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
  grey:   'bg-slate-400',
}

function pillClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function dotClass(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

export default function ReportingView() {
  const [projects,        setProjects]        = useState<Project[]>([])
  const [priorities,      setPriorities]      = useState<DropdownOption[]>([])
  const [productAreas,    setProductAreas]    = useState<DropdownOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<DropdownOption[]>([])
  const [allTasks,        setAllTasks]        = useState<Task[]>([])
  const [allWorkLog,      setAllWorkLog]      = useState<WorkLogEntry[]>([])

  const [sortKey, setSortKey] = useState<SortKey>('ragStatus')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filters
  const [ragFilter,  setRagFilter]  = useState<RagStatus | 'All'>('All')
  const [areaFilter, setAreaFilter] = useState<string>('All')

  // Export modal
  const [exportOpen, setExportOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas, statuses, tasks, log] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
        getAllTasks(),
        getAllWorkLogEntries(),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
      setProjectStatuses(statuses)
      setAllTasks(tasks)
      setAllWorkLog(log)
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

  // ── Derived lookups ──────────────────────────────────────────────────────────

  /** Latest work log entry per project (allWorkLog is already DESC by createdAt) */
  const latestLogByProject = useMemo(() => {
    const map = new Map<number, WorkLogEntry>()
    for (const entry of allWorkLog) {
      if (!map.has(entry.projectId)) map.set(entry.projectId, entry)
    }
    return map
  }, [allWorkLog])

  /** Open/in-progress task counts per project */
  const taskCountsByProject = useMemo(() => {
    const map = new Map<number, { open: number; inProgress: number }>()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      const cur = map.get(t.projectId) ?? { open: 0, inProgress: 0 }
      if (t.status === 'open') cur.open++
      else if (t.status === 'in_progress') cur.inProgress++
      map.set(t.projectId, cur)
    }
    return map
  }, [allTasks])

  // ── Filtered + sorted list ───────────────────────────────────────────────────

  const sorted = useMemo(() => {
    let list = [...projects]

    if (ragFilter !== 'All') list = list.filter(p => p.ragStatus === ragFilter)
    if (areaFilter !== 'All') list = list.filter(p => String(p.productAreaId ?? '') === areaFilter)

    return list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'ragStatus':     av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
        case 'workItem':      av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
        case 'productArea':   av = labelFor(productAreas, a.productAreaId).toLowerCase(); bv = labelFor(productAreas, b.productAreaId).toLowerCase(); break
        case 'priority':      av = labelFor(priorities, a.priorityId).toLowerCase(); bv = labelFor(priorities, b.priorityId).toLowerCase(); break
        case 'latestStatus':  av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
        case 'projectStatus': av = labelFor(projectStatuses, a.statusId).toLowerCase(); bv = labelFor(projectStatuses, b.statusId).toLowerCase(); break
        case 'openTasks': {
          const ac = taskCountsByProject.get(a.id); av = ac ? ac.open + ac.inProgress : 0
          const bc = taskCountsByProject.get(b.id); bv = bc ? bc.open + bc.inProgress : 0
          break
        }
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [projects, sortKey, sortDir, ragFilter, areaFilter, priorities, productAreas, projectStatuses, taskCountsByProject])

  const SortIcon = ({ col }: { col: SortKey }) =>
    <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'
  const filtersActive = ragFilter !== 'All' || areaFilter !== 'All'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0 flex-wrap">
        <div className="mr-2">
          <h1 className="text-lg font-semibold leading-tight">Reporting</h1>
          <p className="text-xs text-muted-foreground">{sorted.length} of {projects.length} projects · read-only</p>
        </div>

        {/* RAG filter */}
        <Select value={ragFilter} onValueChange={v => setRagFilter(v as RagStatus | 'All')}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All RAG</SelectItem>
            <SelectItem value="Red">Red</SelectItem>
            <SelectItem value="Amber">Amber</SelectItem>
            <SelectItem value="Green">Green</SelectItem>
          </SelectContent>
        </Select>

        {/* Product Area filter */}
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Areas</SelectItem>
            {productAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Reset filters */}
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilter('All'); setAreaFilter('All') }}
          >
            ✕ Reset filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setExportOpen(true)}>
            Export…
          </Button>
          <button
            onClick={load}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass} onClick={() => handleSort('ragStatus')}>RAG<SortIcon col="ragStatus" /></th>
              <th className={thClass} onClick={() => handleSort('workItem')}>Work Item<SortIcon col="workItem" /></th>
              <th className={thClass} onClick={() => handleSort('productArea')}>Product Area<SortIcon col="productArea" /></th>
              <th className={thClass} onClick={() => handleSort('priority')}>Priority<SortIcon col="priority" /></th>
              <th className={thClass} onClick={() => handleSort('projectStatus')}>Status<SortIcon col="projectStatus" /></th>
              <th className={thClass} onClick={() => handleSort('openTasks')}>Tasks<SortIcon col="openTasks" /></th>
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Latest Status<SortIcon col="latestStatus" /></th>
              <th className={thClass}>Latest Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  No projects found.
                </td>
              </tr>
            )}
            {sorted.map(p => {
              const priorityOpt = priorities.find(o => o.id === p.priorityId)
              const statusOpt   = projectStatuses.find(o => o.id === p.statusId)
              const counts      = taskCountsByProject.get(p.id)
              const latestLog   = latestLogByProject.get(p.id)

              return (
                <tr key={p.id} className="hover:bg-accent/50">
                  {/* RAG */}
                  <td className="px-3 py-2"><RagBadge status={p.ragStatus} /></td>

                  {/* Work Item */}
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{p.workItem}</td>

                  {/* Product Area */}
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {labelFor(productAreas, p.productAreaId)}
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-2">
                    {priorityOpt ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(priorityOpt.color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass(priorityOpt.color)}`} />
                        {priorityOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Project Status */}
                  <td className="px-3 py-2">
                    {statusOpt ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${pillClass(statusOpt.color)}`}>
                        {statusOpt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(statusOpt.color)}`} />}
                        {statusOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Open Tasks */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {counts && (counts.open > 0 || counts.inProgress > 0) ? (
                      <span className="text-xs text-muted-foreground">
                        {counts.open > 0 && <span className="text-slate-700 font-medium">{counts.open} open</span>}
                        {counts.open > 0 && counts.inProgress > 0 && <span> · </span>}
                        {counts.inProgress > 0 && <span className="text-blue-600 font-medium">{counts.inProgress} active</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Latest Status */}
                  <td className="px-3 py-2 text-muted-foreground max-w-[16rem] truncate">
                    {p.latestStatus || '—'}
                  </td>

                  {/* Latest Work Log */}
                  <td className="px-3 py-2 max-w-[20rem]">
                    {latestLog ? (
                      <span className="text-xs text-muted-foreground">
                        <span className="text-foreground/60 font-medium mr-1.5 shrink-0">
                          {fmtDate(latestLog.createdAt.slice(0, 10))}
                        </span>
                        <span className="truncate">{latestLog.note.replace(/\n/g, ' ')}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      <ReportingExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projects={sorted}
        productAreas={productAreas}
        priorities={priorities}
        projectStatuses={projectStatuses}
        allTasks={allTasks}
        allWorkLog={allWorkLog}
      />
    </div>
  )
}
