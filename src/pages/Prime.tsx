import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllTasks, updateTask } from '@/db/tasks'
import { getAllWorkLogEntries } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry, TaskStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/contexts/SearchContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { pillClass, dotClass, pillClassActive, RAG_ORDER } from '@/lib/colors'
import { loadGuiSettings, buttonStyle } from '@/lib/guiSettings'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { useDataLoader } from '@/hooks/useDataLoader'
import { SplitPane } from '@/components/project/SplitPane'
import { TaskModal } from '@/components/TaskModal'
import { ProjectModal } from '@/components/ProjectModal'
import { CalendarIcon, RotateCcw } from 'lucide-react'

interface PageData {
  projects: Project[]
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  allTasks: Task[]
  allWorkLog: WorkLogEntry[]
}

/** Status indicator — sm for accordion sub-rows, md for general task panel. */
function TaskStatusDot({ status, size = 'sm' }: { status: TaskStatus; size?: 'sm' | 'md' }) {
  const dim  = size === 'md' ? 'w-5 h-5 rounded-md' : 'w-3.5 h-3.5 rounded-md'
  const font = size === 'md' ? 'text-[10px]' : 'text-[8px]'
  const dot  = size === 'md' ? 'w-2 h-2 rounded-sm' : 'w-1 h-1 rounded-sm'
  if (status === 'done') return (
    <span className={`${dim} bg-green-500 border-2 border-green-500 flex items-center justify-center text-white ${font} font-bold leading-none shrink-0`}>✓</span>
  )
  if (status === 'in_progress') return (
    <span className={`${dim} border-2 border-blue-500 flex items-center justify-center shrink-0`}>
      <span className={`${dot} bg-blue-500`} />
    </span>
  )
  return <span className={`${dim} border-2 border-slate-300 flex shrink-0`} />
}

export default function Prime() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { query } = useSearch()

  // Due filter from URL (?filter=due)
  const dueFilter = searchParams.get('filter') === 'due'
  const clearDueFilter = () => setSearchParams({})

  // Filter state — all under prime-specific localStorage keys
  const [ragFilter, setRagFilter]           = useState<RagStatus | 'All'>(() => (localStorage.getItem('myworker:prime-rag') as RagStatus | 'All') ?? 'All')
  const [priorityFilter, setPriorityFilter] = useState<string>(() => localStorage.getItem('myworker:prime-priority') ?? 'All')
  const [statusFilter, setStatusFilter]     = useState<string>(() => localStorage.getItem('myworker:prime-status') ?? 'All')
  const [areaFilter, setAreaFilter]         = useState<string>(() => localStorage.getItem('myworker:prime-area') ?? 'All')
  const [areaFilterButtons]                 = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')

  // Accordion expand state for project task sub-rows
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())

  // Left-panel project sort
  type ProjectSortKey = 'workItem' | 'rag' | 'priority' | 'status' | 'statusComment'
  const [projectSortKey, setProjectSortKey] = useState<ProjectSortKey>(() => (localStorage.getItem('myworker:prime-proj-sort-key') as ProjectSortKey) ?? 'workItem')
  const [projectSortDir, setProjectSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('myworker:prime-proj-sort-dir') as 'asc' | 'desc') ?? 'asc')

  const handleProjectSort = (col: ProjectSortKey) => {
    if (projectSortKey === col) {
      const next = projectSortDir === 'asc' ? 'desc' : 'asc'
      setProjectSortDir(next)
      localStorage.setItem('myworker:prime-proj-sort-dir', next)
    } else {
      setProjectSortKey(col)
      setProjectSortDir('asc')
      localStorage.setItem('myworker:prime-proj-sort-key', col)
      localStorage.setItem('myworker:prime-proj-sort-dir', 'asc')
    }
  }

  // Right-panel status filter + sort for general tasks
  const [generalStatusFilter, setGeneralStatusFilter] = useState<string>('active')
  const [generalSortKey, setGeneralSortKey]   = useState<'title' | 'priority' | 'due'>('due')
  const [generalSortDir, setGeneralSortDir]   = useState<'asc' | 'desc'>('asc')

  const handleGeneralSort = (col: 'title' | 'priority' | 'due') => {
    if (generalSortKey === col) setGeneralSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setGeneralSortKey(col); setGeneralSortDir('asc') }
  }

  // Task modal for editing tasks
  const [editingTask, setEditingTask]   = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  // Project modal for creating projects
  const [projectModalOpen, setProjectModalOpen] = useState(false)

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
    'Failed to load Prime view',
  )

  const projects        = data?.projects        ?? []
  const priorities      = data?.priorities      ?? []
  const productAreas    = data?.productAreas    ?? []
  const projectStatuses = data?.projectStatuses ?? []
  const allTasks        = data?.allTasks        ?? []
  const allWorkLog      = data?.allWorkLog      ?? []

  // Persist filter state
  useEffect(() => { localStorage.setItem('myworker:prime-rag',      ragFilter)      }, [ragFilter])
  useEffect(() => { localStorage.setItem('myworker:prime-priority',  priorityFilter) }, [priorityFilter])
  useEffect(() => { localStorage.setItem('myworker:prime-status',    statusFilter)   }, [statusFilter])
  useEffect(() => { localStorage.setItem('myworker:prime-area',      areaFilter)     }, [areaFilter])

  /** Latest work log entry per project (entries are ordered newest-first from DB) */
  const latestLogByProject = useMemo(() => {
    const map = new Map<number, WorkLogEntry>()
    for (const entry of allWorkLog) {
      if (!map.has(entry.projectId)) map.set(entry.projectId, entry)
    }
    return map
  }, [allWorkLog])

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

  /** Projects with at least one overdue open task */
  const overdueProjectIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId !== null && t.status !== 'done' && t.dueDate && t.dueDate < today)
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks])

  /** Projects with at least one due or overdue open task (for due filter) */
  const projectsWithDueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId !== null && t.status !== 'done' && t.dueDate && t.dueDate <= today)
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks])

  // Auto-expand projects when due filter becomes active
  useEffect(() => {
    if (dueFilter) {
      setExpandedProjects(new Set(projectsWithDueTasks))
    }
    // Only run when dueFilter changes, not when projectsWithDueTasks reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueFilter])

  /** Open task counts per project */
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

  /** General tasks (no project), filtered by search + area + status + due filter */
  const generalTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    let list = allTasks.filter(t => t.projectId === null)

    // Search filter — search title and notes
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      )
    }

    // Due filter — only show due/overdue tasks
    if (dueFilter) {
      list = list.filter(t => t.status !== 'done' && t.dueDate && t.dueDate <= today)
    } else if (!query.trim()) {
      // Only apply area/status filters when not searching
      if (areaFilter !== 'All') {
        const id = Number(areaFilter)
        list = list.filter(t => t.productAreaId === id)
      }
      if (generalStatusFilter === 'active') list = list.filter(t => t.status !== 'done')
      else if (generalStatusFilter !== 'all') list = list.filter(t => t.status === generalStatusFilter as TaskStatus)
    }

    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (generalSortKey === 'title') {
        av = a.title.toLowerCase(); bv = b.title.toLowerCase()
      } else if (generalSortKey === 'priority') {
        av = priorities.find(p => p.id === a.priorityId)?.sortOrder ?? 999
        bv = priorities.find(p => p.id === b.priorityId)?.sortOrder ?? 999
      } else {
        // due — nulls last regardless of direction
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        av = a.dueDate; bv = b.dueDate
      }
      if (av < bv) return generalSortDir === 'asc' ? -1 : 1
      if (av > bv) return generalSortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [allTasks, query, dueFilter, areaFilter, generalStatusFilter, generalSortKey, generalSortDir, priorities])

  /** Filtered + sorted projects */
  const filteredProjects = useMemo(() => {
    let list = [...projects]

    // Due filter takes priority — show only projects with due/overdue tasks
    if (dueFilter) {
      list = list.filter(p => projectsWithDueTasks.has(p.id))
    } else if (query.trim()) {
      // Simple local filter when search active — full FTS search deferred to global
      const q = query.toLowerCase()
      list = list.filter(p =>
        p.workItem.toLowerCase().includes(q) ||
        p.latestStatus.toLowerCase().includes(q)
      )
    } else {
      if (ragFilter !== 'All')      list = list.filter(p => p.ragStatus === ragFilter)
      if (priorityFilter !== 'All') list = list.filter(p => String(p.priorityId ?? '') === priorityFilter)
      if (areaFilter !== 'All')     list = list.filter(p => String(p.productAreaId ?? '') === areaFilter)
      if (statusFilter !== 'All')   list = list.filter(p => String(p.statusId ?? '') === statusFilter)
    }

    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (projectSortKey) {
        case 'workItem':
          av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
        case 'rag':
          av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
        case 'priority':
          av = priorities.find(o => o.id === a.priorityId)?.sortOrder ?? 999
          bv = priorities.find(o => o.id === b.priorityId)?.sortOrder ?? 999; break
        case 'status':
          av = projectStatuses.find(o => o.id === a.statusId)?.sortOrder ?? 999
          bv = projectStatuses.find(o => o.id === b.statusId)?.sortOrder ?? 999; break
        case 'statusComment':
          av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
      }
      if (av < bv) return projectSortDir === 'asc' ? -1 : 1
      if (av > bv) return projectSortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [projects, query, dueFilter, projectsWithDueTasks, ragFilter, priorityFilter, areaFilter, statusFilter, priorities, productAreas, projectStatuses, projectSortKey, projectSortDir])

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

  const savePriority = async (t: Task, priorityId: number | null) => {
    await updateTask({ id: t.id, priorityId })
    reload()
  }

  const saveDueDate = async (t: Task, dueDate: Date | undefined) => {
    const val = dueDate ? dueDate.toISOString().slice(0, 10) : null
    await updateTask({ id: t.id, dueDate: val })
    reload()
  }

  const { buttonColor, buttonOpacity } = loadGuiSettings()
  const btnStyle = buttonStyle(buttonColor, buttonOpacity)

  const hasActiveFilters = ragFilter !== 'All' || priorityFilter !== 'All' || areaFilter !== 'All' || statusFilter !== 'All'

  const projectsWithTasks = filteredProjects.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0)
  const allExpanded = projectsWithTasks.length > 0 && projectsWithTasks.every(p => expandedProjects.has(p.id))

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── Toolbar row 1 ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0">
        <Button onClick={() => setProjectModalOpen(true)} className="h-8 px-3 text-sm" style={btnStyle}>+ Project</Button>
        <Button onClick={() => { setEditingTask(null); setTaskModalOpen(true) }} className="h-8 px-3 text-sm" style={btnStyle}>+ Task</Button>

        {/* Due filter indicator */}
        {dueFilter && (
          <button
            onClick={clearDueFilter}
            className="h-8 px-3 text-sm rounded-md bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors flex items-center gap-2"
          >
            <span>⚠ Due/Overdue Tasks</span>
            <span className="text-amber-600">✕</span>
          </button>
        )}

        {/* RAG filter */}
        <Select value={ragFilter} onValueChange={v => setRagFilter(v as RagStatus | 'All')}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="RAG" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All RAG</SelectItem>
            <SelectItem value="Red">Red</SelectItem>
            <SelectItem value="Amber">Amber</SelectItem>
            <SelectItem value="Green">Green</SelectItem>
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
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

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {projectStatuses.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilter('All'); setPriorityFilter('All'); setAreaFilter('All'); setStatusFilter('All') }}
          >
            ✕ Reset filters
          </Button>
        )}

        {/* Expand / Collapse all — right side */}
        <div className="ml-auto">
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
        </div>
      </div>

      {/* ── Toolbar row 2 — Area filter ── */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-background shrink-0">
        <span className="text-xs text-muted-foreground font-medium mr-1">Area:</span>
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
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Areas</SelectItem>
              {productAreas.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Split pane ── */}
      <SplitPane
        initialSplitPct={70}
        left={<LeftPane />}
        right={<RightPane />}
      />

      {/* Task modal */}
      <TaskModal
        task={editingTask}
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSaved={() => reload()}
        projects={projects}
      />

      {/* Project modal */}
      <ProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSaved={(projectId) => {
          reload()
          if (projectId > 0) navigate(`/projects/${projectId}`)
        }}
      />
    </div>
  )

  // ── Left pane — all projects ──────────────────────────────────────────────
  function LeftPane() {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
          <span className="text-xs text-muted-foreground">({filteredProjects.length})</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-background z-10">
              <tr>
                <th className="w-10 px-2 py-1.5 shrink-0 border-b bg-background" />
                {(() => {
                  const thBase = 'border-b bg-background text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none cursor-pointer hover:text-foreground transition-colors'
                  const SortInd = ({ col }: { col: typeof projectSortKey }) =>
                    projectSortKey === col ? <span className="ml-1 opacity-50">{projectSortDir === 'asc' ? '↑' : '↓'}</span> : null
                  return (<>
                    <th className={`${thBase} px-3 py-1.5`} onClick={() => handleProjectSort('workItem')}>Work Item<SortInd col="workItem" /></th>
                    <th className={`${thBase} w-px px-2 py-1.5 whitespace-nowrap`} onClick={() => handleProjectSort('rag')}>RAG<SortInd col="rag" /></th>
                    <th className={`${thBase} w-px px-2 py-1.5 whitespace-nowrap`} onClick={() => handleProjectSort('priority')}>Priority<SortInd col="priority" /></th>
                    <th className={`${thBase} w-px px-2 py-1.5 whitespace-nowrap`} onClick={() => handleProjectSort('status')}>Status<SortInd col="status" /></th>
                    <th className={`${thBase} px-3 py-1.5 whitespace-nowrap`} onClick={() => handleProjectSort('statusComment')}>Status Comment<SortInd col="statusComment" /></th>
                  </>)
                })()}
              </tr>
            </thead>
            {filteredProjects.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No projects match the current filters.
                  </td>
                </tr>
              </tbody>
            )}
            {filteredProjects.map(p => <ProjectRows key={p.id} p={p} />)}
          </table>
        </div>
      </div>
    )
  }

  function ProjectRows({ p }: { p: Project }) {
    const isExpanded = expandedProjects.has(p.id)
    const projTasks  = tasksByProject.get(p.id) ?? []
    const hasTasks   = projTasks.length > 0
    const hasOverdue = overdueProjectIds.has(p.id)
    const counts     = taskCountsByProject.get(p.id)
    const latestLog  = latestLogByProject.get(p.id)

    return (
      <tbody className="group/proj">
        {/* TR1 — project header */}
        <tr
          onClick={() => navigate(`/projects/${p.id}`)}
          className="group-hover/proj:bg-blue-50/60 dark:group-hover/proj:bg-blue-950/20 cursor-pointer transition-colors"
        >
          <td className="w-10 px-1 py-1.5">
            {hasTasks ? (
              <button
                onClick={e => { e.stopPropagation(); toggleProject(p.id) }}
                className="text-muted-foreground hover:text-foreground w-8 h-7 flex items-center justify-center text-xs rounded hover:bg-accent transition-colors shrink-0"
                title={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <span className="text-muted-foreground/30 w-8 h-7 flex items-center justify-center text-xs shrink-0">—</span>
            )}
          </td>
          <td className="px-3 py-1 font-medium max-w-[18rem]">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="truncate">{p.workItem}</span>
              {(hasOverdue || (counts && (counts.open > 0 || counts.inProgress > 0))) && (
                <span className="flex items-center gap-1.5 font-normal">
                  {hasOverdue && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                      🗓 Overdue
                    </span>
                  )}
                  {counts && (counts.open > 0 || counts.inProgress > 0) && (
                    <span className="text-xs text-muted-foreground">
                      {counts.open > 0 && <span>{counts.open} open</span>}
                      {counts.open > 0 && counts.inProgress > 0 && <span> · </span>}
                      {counts.inProgress > 0 && <span className="text-blue-600">{counts.inProgress} active</span>}
                    </span>
                  )}
                </span>
              )}
            </div>
          </td>
          <td className="w-px px-2 py-1.5 whitespace-nowrap"><RagBadge status={p.ragStatus} /></td>
          <td className="w-px px-2 py-1.5 whitespace-nowrap">
            {p.priorityId ? (() => {
              const opt = priorities.find(o => o.id === p.priorityId)
              const c = opt?.color ?? ''
              return (
                <span className={`inline-flex items-center gap-1 px-1 py-0 rounded-full text-xs border ${pillClass(c)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass(c)}`} />
                  {opt?.label ?? '—'}
                </span>
              )
            })() : <span className="text-muted-foreground text-xs">—</span>}
          </td>
          <td className="w-px px-2 py-1.5 whitespace-nowrap">
            {p.statusId ? (() => {
              const opt = projectStatuses.find(s => s.id === p.statusId)
              if (!opt) return <span className="text-muted-foreground text-xs">—</span>
              const c = opt.color
              return (
                <span className={`inline-flex items-center gap-1 text-xs px-1 py-0 rounded-full border ${pillClass(c)}`}>
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

        {/* TR2 — latest work log entry */}
        <tr
          onClick={() => navigate(`/projects/${p.id}`)}
          className="group-hover/proj:bg-blue-50/40 dark:group-hover/proj:bg-blue-950/10 cursor-pointer transition-colors border-b border-border"
        >
          <td className="w-10" />
          <td colSpan={5} className="px-3 pb-1.5 pt-0">
            <span className="text-xs italic text-muted-foreground/70 truncate block pl-0">
              {latestLog ? latestLog.note : '—'}
            </span>
          </td>
        </tr>

        {/* Expanded task sub-rows */}
        {isExpanded && projTasks.length === 0 && (
          <tr className="border-b border-border">
            <td className="w-10" />
            <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground italic">No open tasks</td>
          </tr>
        )}
        {isExpanded && projTasks.map(t => {
          const taskDueDateObj = t.dueDate ? new Date(t.dueDate + 'T12:00:00') : undefined
          const taskPriority = priorities.find(pr => pr.id === t.priorityId)
          return (
            <tr
              key={t.id}
              className="hover:bg-accent/40 transition-colors cursor-pointer border-b border-border/60"
              onClick={() => { setEditingTask(t); setTaskModalOpen(true) }}
            >
              <td className="w-10" />
              <td className="px-3 py-1 pl-7" colSpan={4}>
                <span className="flex items-center gap-2">
                  <button
                    onClick={async e => { e.stopPropagation(); await cycleTaskStatus(t) }}
                    className="shrink-0 hover:scale-110 transition-transform"
                    title={`Status: ${t.status} — click to cycle`}
                  >
                    <TaskStatusDot status={t.status} />
                  </button>
                  {taskPriority && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${dotClass(taskPriority.color)}`}
                      title={taskPriority.label}
                    />
                  )}
                  <span className="text-xs italic truncate text-slate-600 dark:text-slate-400">{t.title}</span>
                </span>
              </td>
              <td className="px-3 py-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="hover:opacity-70 transition-opacity"
                      title={t.dueDate ? `Due ${fmtDate(t.dueDate)} — click to change` : 'Set due date'}
                    >
                      {t.dueDate ? (
                        <span className={`text-xs whitespace-nowrap ${
                          isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                          isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                          'text-muted-foreground'
                        }`}>
                          {fmtDate(t.dueDate)}
                        </span>
                      ) : (
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground/40" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" onClick={e => e.stopPropagation()}>
                    <Calendar
                      mode="single"
                      selected={taskDueDateObj}
                      onSelect={d => saveDueDate(t, d)}
                    />
                    {t.dueDate && (
                      <div className="border-t p-2">
                        <button
                          className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                          onClick={() => saveDueDate(t, undefined)}
                        >
                          Clear date
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </td>
            </tr>
          )
        })}
      </tbody>
    )
  }

  // ── Right pane — general tasks ────────────────────────────────────────────
  function RightPane() {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General Tasks</span>
          <Select value={generalStatusFilter} onValueChange={setGeneralStatusFilter}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {generalTasks.length} task{generalTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-4 py-1 border-b bg-muted/20 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
          <span className="w-5 shrink-0" />
          <button onClick={() => handleGeneralSort('title')} className="flex-1 text-left hover:text-foreground transition-colors">
            Task{generalSortKey === 'title' && <span className="ml-1 opacity-50">{generalSortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
          <button onClick={() => handleGeneralSort('priority')} className="w-4 text-center shrink-0 hover:text-foreground transition-colors">
            Pri{generalSortKey === 'priority' && <span className="ml-0.5 opacity-50">{generalSortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
          <button onClick={() => handleGeneralSort('due')} className="w-14 text-right shrink-0 hover:text-foreground transition-colors">
            Due{generalSortKey === 'due' && <span className="ml-1 opacity-50">{generalSortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-auto divide-y divide-border/60">
          {generalTasks.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No general tasks.</p>
          ) : (
            generalTasks.map(t => <GeneralTaskRow key={t.id} t={t} />)
          )}
        </div>
      </div>
    )
  }

  function GeneralTaskRow({ t }: { t: Task }) {
    const priorityOpt = priorities.find(p => p.id === t.priorityId)
    const dueDateObj  = t.dueDate ? new Date(t.dueDate + 'T12:00:00') : undefined

    return (
      <div
        className="px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => { setEditingTask(t); setTaskModalOpen(true) }}
      >
        {/* Line 1: status dot + title + priority dot + due date */}
        <div className="flex items-start gap-2">
          {/* Status dot */}
          <button
            onClick={async e => { e.stopPropagation(); await cycleTaskStatus(t) }}
            className="shrink-0 mt-0.5 hover:scale-110 transition-transform"
            title={`Status: ${t.status} — click to cycle`}
          >
            <TaskStatusDot status={t.status} size="md" />
          </button>

          {/* Title */}
          <span className={`flex-1 text-sm leading-snug line-clamp-2 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
            {t.title}
          </span>

          {/* Priority popover */}
          <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={e => e.stopPropagation()}
                  className="w-4 flex items-center justify-center hover:scale-125 transition-transform"
                  title={priorityOpt ? priorityOpt.label : 'Set priority'}
                >
                  {priorityOpt ? (
                    <span className={`w-2.5 h-2.5 rounded-full ${dotClass(priorityOpt.color)}`} />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" onClick={e => e.stopPropagation()}>
                <button
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
                  onClick={() => savePriority(t, null)}
                >
                  None
                </button>
                {priorities.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors flex items-center gap-2"
                    onClick={() => savePriority(t, p.id)}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(p.color)}`} />
                    {p.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Due date popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  onClick={e => e.stopPropagation()}
                  className="w-14 text-right hover:opacity-70 transition-opacity"
                  title={t.dueDate ? `Due ${fmtDate(t.dueDate)} — click to change` : 'Set due date'}
                >
                  {t.dueDate ? (
                    <span className={`text-xs whitespace-nowrap ${
                      isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                      isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                      'text-muted-foreground'
                    }`}>
                      {fmtDate(t.dueDate)}
                    </span>
                  ) : (
                    <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" onClick={e => e.stopPropagation()}>
                <Calendar
                  mode="single"
                  selected={dueDateObj}
                  onSelect={d => saveDueDate(t, d)}
                />
                {t.dueDate && (
                  <div className="border-t p-2">
                    <button
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                      onClick={() => saveDueDate(t, undefined)}
                    >
                      Clear date
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Line 2: notes + recurrence indicator */}
        {(t.notes || t.isRecurring) && (
          <div className="flex items-center gap-1 pl-7 mt-0.5">
            {t.notes && (
              <span className="text-xs text-muted-foreground truncate flex-1">{t.notes}</span>
            )}
            {t.isRecurring && (
              <span title="Recurring task"><RotateCcw className="w-3 h-3 text-muted-foreground shrink-0" /></span>
            )}
          </div>
        )}
      </div>
    )
  }
}
