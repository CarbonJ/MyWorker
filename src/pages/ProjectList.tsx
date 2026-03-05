import { useEffect, useState, useMemo, useRef, useLayoutEffect, Fragment, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { searchProjectIds } from '@/db/search'
import { getAllTasks, updateTask } from '@/db/tasks'
import { getAllWorkLogEntries } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry, TaskStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/contexts/SearchContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RAG_ORDER, pillClass, dotClass, pillClassActive } from '@/lib/colors'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { useDataLoader } from '@/hooks/useDataLoader'
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants'
import { MarkdownContent } from '@/components/MarkdownContent'
import { SplitPane } from '@/components/project/SplitPane'
import { TaskModal } from '@/components/TaskModal'

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

function ExpandableText({ children, textKey }: { children: ReactNode; textKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isClamped, setIsClamped] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    if (expanded) return
    const el = ref.current
    if (!el) return
    setIsClamped(el.scrollHeight > el.clientHeight)
  }, [textKey, expanded])

  return (
    <div>
      <div ref={ref} className={!expanded ? 'line-clamp-3' : undefined}>
        {children}
      </div>
      {(isClamped || expanded) && (
        <button
          className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none mt-0.5 flex items-center gap-0.5"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? '↑' : '… ↓'}
        </button>
      )}
    </div>
  )
}

/** Read-only status indicator used in accordion task sub-rows */
function TaskStatusDot({ status }: { status: TaskStatus }) {
  if (status === 'done') return (
    <span className="w-3.5 h-3.5 rounded-sm bg-green-500 border-2 border-green-500 flex items-center justify-center text-white text-[8px] font-bold leading-none shrink-0">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-3.5 h-3.5 rounded-sm border-2 border-blue-500 flex items-center justify-center shrink-0">
      <span className="w-1 h-1 rounded-sm bg-blue-500" />
    </span>
  )
  return <span className="w-3.5 h-3.5 rounded-sm border-2 border-slate-300 shrink-0" />
}

export default function ProjectList() {
  const navigate = useNavigate()
  const { query } = useSearch()
  const [searchIds, setSearchIds] = useState<number[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(() => (localStorage.getItem('myworker:sort-key-projects') as SortKey) ?? 'productArea')
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem('myworker:sort-dir-projects') as SortDir) ?? 'asc')
  // Tracks whether the user has manually clicked a column header. Until they do,
  // Area asc is applied silently with no visible sort indicator.
  const [userHasSorted, setUserHasSorted] = useState(() => localStorage.getItem('myworker:projects-user-sorted') === 'true')
  const [ragFilter, setRagFilter] = useState<RagStatus | 'All'>('All')
  const [priorityFilter, setPriorityFilter] = useState<string>('All')  // 'All' | priority id as string
  const [areaFilter, setAreaFilter] = useState<string>(() => localStorage.getItem('myworker:area-filter-projects') ?? 'All')
  const [areaFilterButtons] = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')
  const [statusFilter, setStatusFilter] = useState<string>('All')      // 'All' | project_status id as string
  const [viewMode, setViewMode] = useState<'table' | 'split'>(
    () => {
      const stored = localStorage.getItem('myworker:projects-view-mode')
      return stored === 'split' ? 'split' : 'table'
    }
  )
  // Accordion expand state for split view (projects with expanded task sub-rows)
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  // Right-panel status filter for loose tasks in split view
  const [looseStatusFilter, setLooseStatusFilter] = useState<string>('active')
  // Task modal for editing loose tasks in split view
  const [looseEditingTask, setLooseEditingTask] = useState<Task | null>(null)
  const [looseModalOpen, setLooseModalOpen] = useState(false)

  const { data, reload } = useDataLoader<PageData>(
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

  const projects        = data?.projects        ?? []
  const priorities      = data?.priorities      ?? []
  const productAreas    = data?.productAreas    ?? []
  const projectStatuses = data?.projectStatuses ?? []
  const allTasks        = data?.allTasks        ?? []
  const allWorkLog      = data?.allWorkLog      ?? []

  // Persist sort and area filter across navigation
  useEffect(() => { localStorage.setItem('myworker:sort-key-projects', sortKey) }, [sortKey])
  useEffect(() => { localStorage.setItem('myworker:sort-dir-projects', sortDir) }, [sortDir])
  useEffect(() => { localStorage.setItem('myworker:projects-user-sorted', String(userHasSorted)) }, [userHasSorted])
  useEffect(() => { localStorage.setItem('myworker:area-filter-projects', areaFilter) }, [areaFilter])
  useEffect(() => { localStorage.setItem('myworker:projects-view-mode', viewMode) }, [viewMode])

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
    setUserHasSorted(true)
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

  /** Projects that have at least one overdue open task — auto-expanded in split view */
  const overdueProjectIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId !== null && t.status !== 'done' && t.dueDate && t.dueDate < today)
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks])

  /** Open/in-progress tasks grouped by projectId (excludes done) */
  const tasksByProject = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      const arr = map.get(t.projectId) ?? []
      arr.push(t)
      map.set(t.projectId, arr)
    }
    return map
  }, [allTasks])

  /** Loose tasks (no project) for the right panel, filtered by area + looseStatusFilter */
  const looseTasks = useMemo(() => {
    let list = allTasks.filter(t => t.projectId === null)
    if (areaFilter !== 'All') {
      const id = Number(areaFilter)
      list = list.filter(t => t.productAreaId === id)
    }
    if (looseStatusFilter === 'active') list = list.filter(t => t.status !== 'done')
    else if (looseStatusFilter !== 'all') list = list.filter(t => t.status === looseStatusFilter as TaskStatus)
    return list
  }, [allTasks, areaFilter, looseStatusFilter])

  const toggleProject = (id: number) =>
    setExpandedProjects(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const cycleTaskStatus = async (t: Task) => {
    const next: TaskStatus = t.status === 'open' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'open'
    await updateTask({ id: t.id, status: next })
    reload()
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    userHasSorted && sortKey === col
      ? <span className="ml-1 opacity-50">{sortDir === 'asc' ? '↑' : '↓'}</span>
      : null

  const thClass = 'px-4 py-1 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0 flex-wrap">
        {/* New Project button */}
        <Button onClick={() => navigate('/projects/new')} className="h-8 px-3 text-sm">+</Button>
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
        {/* Product Area filter — visible in both table and split modes */}
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
        <div className="ml-auto flex items-center gap-2">
          {/* Expand / Collapse all — only in Task View */}
          {viewMode === 'split' && (() => {
            const projectsWithTasks = sorted.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0)
            const allExpanded = projectsWithTasks.length > 0 && projectsWithTasks.every(p => expandedProjects.has(p.id))
            return (
              <button
                onClick={() =>
                  allExpanded
                    ? setExpandedProjects(new Set())
                    : setExpandedProjects(new Set(projectsWithTasks.map(p => p.id)))
                }
                className="h-8 w-8 flex items-center justify-center border rounded-md text-sm hover:bg-accent transition-colors"
                title={allExpanded ? 'Collapse all projects' : 'Expand all projects'}
              >
                {allExpanded ? '−' : '+'}
              </button>
            )
          })()}
          {/* Table / Split view toggle */}
          <div className="flex items-center border rounded-md overflow-hidden text-xs">
            <button
              onClick={() => setViewMode('table')}
              className={`h-8 px-3 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`h-8 px-3 border-l transition-colors ${viewMode === 'split' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Task View
            </button>
          </div>
        </div>
      </div>

      {/* ── Table view ── */}
      {viewMode === 'table' && (
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
              {sorted.map(p => <ProjectRow key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Split view ── */}
      {viewMode === 'split' && (
        <SplitPane
          initialSplitPct={70}
          left={
            <div className="flex flex-col h-full overflow-hidden">
              {/* Left panel header */}
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
                <span className="text-xs text-muted-foreground">({sorted.length})</span>
              </div>
              {/* Project accordion table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr>
                      <th className="w-10 px-2 py-1.5 shrink-0" />
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Item</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">RAG</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Priority</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status Comment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          No projects match the current filters.
                        </td>
                      </tr>
                    )}
                    {sorted.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0).map(p => {
                      const isExpanded = expandedProjects.has(p.id)
                      const projTasks = tasksByProject.get(p.id) ?? []
                      const hasOverdue = overdueProjectIds.has(p.id)
                      return (
                        <Fragment key={p.id}>
                          {/* Project row */}
                          <tr
                            onClick={() => navigate(`/projects/${p.id}`)}
                            className="bg-blue-50/50 hover:bg-blue-100/60 dark:bg-blue-950/20 dark:hover:bg-blue-900/30 cursor-pointer transition-colors"
                          >
                            <td className="w-10 px-1 py-1.5">
                              {projTasks.length > 0 && (
                                <button
                                  onClick={e => { e.stopPropagation(); toggleProject(p.id) }}
                                  className="text-muted-foreground hover:text-foreground w-8 h-7 flex items-center justify-center text-xs rounded hover:bg-accent transition-colors shrink-0"
                                  title={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
                                >
                                  {isExpanded ? '▼' : '▶'}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-medium max-w-[18rem]">
                              <span className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="truncate">{p.workItem}</span>
                                {hasOverdue && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                                    🗓 Overdue
                                  </span>
                                )}
                                {!isExpanded && projTasks.length > 0 && (
                                  <span className="text-xs text-muted-foreground shrink-0 font-normal">({projTasks.length} open)</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap"><RagBadge status={p.ragStatus} /></td>
                            <td className="px-3 py-1.5">
                              {p.priorityId ? (() => {
                                const opt = priorities.find(o => o.id === p.priorityId)
                                const c = opt?.color ?? ''
                                return (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${pillClass(c)}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass(c)}`} />
                                    {opt?.label ?? '—'}
                                  </span>
                                )
                              })() : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              {p.statusId ? (() => {
                                const opt = projectStatuses.find(s => s.id === p.statusId)
                                if (!opt) return <span className="text-muted-foreground text-xs">—</span>
                                const c = opt.color
                                return (
                                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${pillClass(c)}`}>
                                    {c && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(c)}`} />}
                                    {opt.label}
                                  </span>
                                )
                              })() : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="px-3 py-1.5 max-w-[14rem]">
                              <span className="text-xs text-muted-foreground line-clamp-2">{p.latestStatus || '—'}</span>
                            </td>
                          </tr>
                          {/* Expanded task sub-rows */}
                          {isExpanded && projTasks.length === 0 && (
                            <tr className="bg-muted/10">
                              <td className="w-10" />
                              <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground italic">No open tasks</td>
                            </tr>
                          )}
                          {isExpanded && projTasks.map(t => (
                            <tr key={t.id} className="hover:bg-accent/40 transition-colors">
                              <td className="w-10" />
                              <td className="px-3 py-1 pl-7" colSpan={4}>
                                <span className="flex items-center gap-2">
                                  <TaskStatusDot status={t.status} />
                                  <span className="text-xs italic truncate text-slate-600 dark:text-slate-400">{t.title}</span>
                                </span>
                              </td>
                              <td className="px-3 py-1.5">
                                {t.dueDate && (
                                  <span className={`text-xs whitespace-nowrap ${
                                    isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                                    isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                                    'text-muted-foreground'
                                  }`}>
                                    {fmtDate(t.dueDate)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          }
          right={
            <div className="flex flex-col h-full overflow-hidden">
              {/* Right panel header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Loose Tasks</span>
                <Select value={looseStatusFilter} onValueChange={setLooseStatusFilter}>
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-auto">
                  {looseTasks.length} task{looseTasks.length !== 1 ? 's' : ''}
                </span>
              </div>
              {/* Right panel task list */}
              <div className="flex-1 overflow-auto divide-y divide-border/60">
                {looseTasks.length === 0 ? (
                  <p className="px-4 py-12 text-center text-sm text-muted-foreground">No loose tasks.</p>
                ) : (
                  looseTasks.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => { setLooseEditingTask(t); setLooseModalOpen(true) }}
                    >
                      {/* Clickable status dot cycles open → in_progress → done */}
                      <button
                        onClick={async e => { e.stopPropagation(); await cycleTaskStatus(t) }}
                        className="shrink-0"
                        title={`Status: ${t.status} — click to cycle`}
                      >
                        <TaskStatusDot status={t.status} />
                      </button>
                      <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                        {t.title}
                      </span>
                      {t.dueDate && (
                        <span className={`text-xs shrink-0 ${
                          isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                          isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                          'text-muted-foreground'
                        }`}>
                          {fmtDate(t.dueDate)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          }
        />
      )}

      {/* Task modal for editing loose tasks in split view */}
      <TaskModal
        task={looseEditingTask}
        open={looseModalOpen}
        onClose={() => { setLooseModalOpen(false); setLooseEditingTask(null) }}
        onSaved={() => reload()}
        projects={projects}
      />
    </div>
  )

  /** Shared project row renderer used in table view */
  function ProjectRow({ p }: { p: Project }) {
    return (
      <tr
        onClick={() => navigate(`/projects/${p.id}`)}
        className="hover:bg-accent cursor-pointer transition-colors"
      >
        <td className={`px-4 py-1 font-medium${p.workItem.length <= 65 ? ' whitespace-nowrap' : ''}`}>
          <span className="flex items-center gap-2 flex-wrap">
            {p.workItem}
            {p.dueDate && p.dueDate < today && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                🗓 Overdue
              </span>
            )}
          </span>
        </td>
        <td className="px-4 py-1">
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
        <td className="px-4 py-1">
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
        <td className="px-4 py-1"><RagBadge status={p.ragStatus} /></td>
        <td className="px-4 py-1">
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
        <td className="px-4 py-1 whitespace-nowrap">
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
        <td className="px-4 py-1 max-w-[16rem]">
          {p.latestStatus
            ? <ExpandableText textKey={p.latestStatus}>
                <span className="text-xs text-muted-foreground">{p.latestStatus}</span>
              </ExpandableText>
            : <span className="text-xs text-muted-foreground">—</span>
          }
        </td>
        <td className="px-4 py-1 max-w-[20rem]">
          {(() => {
            const latestLog = latestLogByProject.get(p.id)
            return latestLog ? (
              <ExpandableText textKey={latestLog.note}>
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground/60 font-medium mr-1.5">
                    {fmtDate(latestLog.createdAt.slice(0, 10))}
                  </span>
                  <MarkdownContent className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {latestLog.note}
                  </MarkdownContent>
                </div>
              </ExpandableText>
            ) : <span className="text-xs text-muted-foreground">—</span>
          })()}
        </td>
      </tr>
    )
  }
}
