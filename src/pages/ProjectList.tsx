import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { searchProjectIds } from '@/db/search'
import { getAllTasks } from '@/db/tasks'
import { getAllWorkLogEntries } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/contexts/SearchContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RAG_ORDER, pillClass, dotClass, pillClassActive } from '@/lib/colors'
import { fmtDate } from '@/lib/utils'
import { useDataLoader } from '@/hooks/useDataLoader'
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants'

type SortKey = 'workItem' | 'productArea' | 'priority' | 'ragStatus' | 'projectStatus' | 'latestStatus' | 'updatedAt' | 'openTasks'
type SortDir = 'asc' | 'desc'

interface PageData {
  projects: Project[]
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  allTasks: Task[]
  allWorkLog: WorkLogEntry[]
}

export default function ProjectList() {
  const navigate = useNavigate()
  const { query } = useSearch()
  const [searchIds, setSearchIds] = useState<number[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('productArea')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [ragFilter, setRagFilter] = useState<RagStatus | 'All'>('All')
  const [priorityFilter, setPriorityFilter] = useState<string>('All')  // 'All' | priority id as string
  const [areaFilter, setAreaFilter] = useState<string>(() => localStorage.getItem('myworker:area-filter-projects') ?? 'All')
  const [areaFilterButtons] = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')
  const [statusFilter, setStatusFilter] = useState<string>('All')      // 'All' | project_status id as string

  const { data } = useDataLoader<PageData>(
    async () => {
      const [projects, priorities, productAreas, projectStatuses, allTasks, allWorkLog] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
        getAllTasks(),
        getAllWorkLogEntries(),
      ])
      return { projects, priorities, productAreas, projectStatuses, allTasks, allWorkLog }
    },
    'Failed to load projects',
  )

  const projects       = data?.projects       ?? []
  const priorities     = data?.priorities     ?? []
  const productAreas   = data?.productAreas   ?? []
  const projectStatuses = data?.projectStatuses ?? []
  const allTasks       = data?.allTasks       ?? []
  const allWorkLog     = data?.allWorkLog     ?? []

  // Persist area filter across navigation
  useEffect(() => { localStorage.setItem('myworker:area-filter-projects', areaFilter) }, [areaFilter])

  // Full-text search — debounced
  useEffect(() => {
    if (!query.trim()) { setSearchIds(null); return }
    const t = setTimeout(async () => {
      const ids = await searchProjectIds(query)
      setSearchIds(ids)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const labelFor = (opts: DropdownOption[], id: number | null) =>
    opts.find(o => o.id === id)?.label ?? '—'

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  /** Latest work log entry per project */
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

  const sorted = useMemo(() => {
    let list = [...projects]

    if (searchIds !== null) {
      const idSet = new Set(searchIds)
      list = list.filter(p => idSet.has(p.id))
      list.sort((a, b) => searchIds.indexOf(a.id) - searchIds.indexOf(b.id))
      return list
    }

    if (ragFilter !== 'All') list = list.filter(p => p.ragStatus === ragFilter)
    if (priorityFilter !== 'All') list = list.filter(p => String(p.priorityId ?? '') === priorityFilter)
    if (areaFilter !== 'All') list = list.filter(p => String(p.productAreaId ?? '') === areaFilter)
    if (statusFilter !== 'All') list = list.filter(p => String(p.statusId ?? '') === statusFilter)

    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'workItem': av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
        case 'productArea': av = labelFor(productAreas, a.productAreaId).toLowerCase(); bv = labelFor(productAreas, b.productAreaId).toLowerCase(); break
        case 'priority': av = labelFor(priorities, a.priorityId).toLowerCase(); bv = labelFor(priorities, b.priorityId).toLowerCase(); break
        case 'ragStatus': av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
        case 'projectStatus': av = labelFor(projectStatuses, a.statusId).toLowerCase(); bv = labelFor(projectStatuses, b.statusId).toLowerCase(); break
        case 'latestStatus': av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
        case 'updatedAt': av = a.updatedAt; bv = b.updatedAt; break
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

    return list
  }, [projects, searchIds, sortKey, sortDir, ragFilter, priorityFilter, areaFilter, statusFilter, priorities, productAreas, projectStatuses, taskCountsByProject])

  const SortIcon = ({ col }: { col: SortKey }) =>
    <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0 flex-wrap">
        {/* RAG filter */}
        <Select value={ragFilter} onValueChange={v => setRagFilter(v as RagStatus | 'All')}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="RAG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All RAG</SelectItem>
            <SelectItem value="Red">Red</SelectItem>
            <SelectItem value="Amber">Amber</SelectItem>
            <SelectItem value="Green">Green</SelectItem>
          </SelectContent>
        </Select>
        {/* Priority filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Priorities</SelectItem>
            {priorities.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass(p.color)}`} />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Product Area filter */}
        {areaFilterButtons ? (
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { value: 'All', label: 'All Areas', color: '' },
              ...productAreas.map(a => ({ value: String(a.id), label: a.label, color: a.color })),
            ].map(opt => {
              const anyActive = areaFilter !== 'All'
              const isActive = areaFilter === opt.value
              const coloredClass = isActive
                ? (opt.color ? pillClassActive(opt.color) : 'bg-primary text-primary-foreground border-primary')
                : anyActive
                  ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  : (opt.color ? pillClass(opt.color) : 'border-input bg-background hover:bg-accent hover:text-accent-foreground')
              return (
                <button
                  key={opt.value}
                  onClick={() => setAreaFilter(isActive && opt.value !== 'All' ? 'All' : opt.value)}
                  className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${coloredClass}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ) : (
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Areas</SelectItem>
              {productAreas.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Project Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {projectStatuses.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(ragFilter !== 'All' || priorityFilter !== 'All' || areaFilter !== 'All' || statusFilter !== 'All') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilter('All'); setPriorityFilter('All'); setAreaFilter('All'); setStatusFilter('All') }}
          >
            ✕ Reset filters
          </Button>
        )}
        <Button className="ml-auto" onClick={() => navigate('/projects/new')}>
          + New Project
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass} onClick={() => handleSort('workItem')}>Work Item<SortIcon col="workItem" /></th>
              <th className={thClass} onClick={() => handleSort('productArea')}>Area<SortIcon col="productArea" /></th>
              <th className={thClass} onClick={() => handleSort('priority')}>Priority<SortIcon col="priority" /></th>
              <th className={thClass} onClick={() => handleSort('ragStatus')}>RAG<SortIcon col="ragStatus" /></th>
              <th className={thClass} onClick={() => handleSort('projectStatus')}>Status<SortIcon col="projectStatus" /></th>
              <th className={thClass} onClick={() => handleSort('openTasks')}>Tasks<SortIcon col="openTasks" /></th>
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Status Comment<SortIcon col="latestStatus" /></th>
              <th className={thClass}>Latest Log Entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                  {query ? 'No results found.' : 'No projects yet — create one to get started.'}
                </td>
              </tr>
            )}
            {sorted.map(p => (
              <tr
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="hover:bg-accent cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    {p.workItem}
                    {p.dueDate && p.dueDate < today && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                        🗓 Overdue
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.productAreaId ? (() => {
                    const opt = productAreas.find(o => o.id === p.productAreaId)
                    const color = opt?.color ?? ''
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass(color)}`} />
                        {opt?.label ?? '—'}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3">
                  {p.priorityId ? (() => {
                    const opt = priorities.find(o => o.id === p.priorityId)
                    const color = opt?.color ?? ''
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass(color)}`} />
                        {opt?.label ?? '—'}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3"><RagBadge status={p.ragStatus} /></td>
                <td className="px-4 py-3">
                  {p.statusId ? (() => {
                    const opt = projectStatuses.find(s => s.id === p.statusId)
                    if (!opt) return <span className="text-muted-foreground">—</span>
                    const color = opt.color
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${pillClass(color)}`}>
                        {color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(color)}`} />}
                        {opt.label}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                {/* Open Tasks */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {(() => {
                    const counts = taskCountsByProject.get(p.id)
                    return counts && (counts.open > 0 || counts.inProgress > 0) ? (
                      <span className="text-xs text-muted-foreground">
                        {counts.open > 0 && <span className="text-slate-700 font-medium">{counts.open} open</span>}
                        {counts.open > 0 && counts.inProgress > 0 && <span> · </span>}
                        {counts.inProgress > 0 && <span className="text-blue-600 font-medium">{counts.inProgress} active</span>}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>
                  })()}
                </td>
                {/* Latest Status */}
                <td className="px-4 py-3 max-w-[16rem]">
                  <span className="text-xs text-muted-foreground">{p.latestStatus || '—'}</span>
                </td>
                {/* Latest Update */}
                <td className="px-4 py-3 max-w-[20rem]">
                  {(() => {
                    const latestLog = latestLogByProject.get(p.id)
                    return latestLog ? (
                      <span className="text-xs text-muted-foreground">
                        <span className="text-foreground/60 font-medium mr-1.5 shrink-0">
                          {fmtDate(latestLog.createdAt.slice(0, 10))}
                        </span>
                        <span>{latestLog.note}</span>
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
