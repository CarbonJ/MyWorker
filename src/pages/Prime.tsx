import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getAllProjects, updateProject } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllTasks, updateTask } from '@/db/tasks'
import { getLatestWorkLogPerProject } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry, TaskStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/contexts/SearchContext'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Check } from 'lucide-react'
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
  latestLogByProject: WorkLogEntry[]
}

type ProjectSortKey = 'workItem' | 'rag' | 'priority' | 'status' | 'statusComment'
type ProjectSortEntry = { key: ProjectSortKey; dir: 'asc' | 'desc' }
type GeneralSortKey = 'title' | 'priority' | 'due'
type GeneralSortEntry = { key: GeneralSortKey; dir: 'asc' | 'desc' }

function loadArr(key: string, fallback: string[]): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}
function loadSorted<T>(key: string, fallback: T[]): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
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

const RAG_OPTIONS: { value: RagStatus; label: string; dotColor: string }[] = [
  { value: 'Green', label: 'Green', dotColor: 'bg-green-500' },
  { value: 'Amber', label: 'Amber', dotColor: 'bg-amber-400' },
  { value: 'Red',   label: 'Red',   dotColor: 'bg-red-500' },
]

export default function Prime() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { query } = useSearch()

  // Due filter from URL (?filter=due)
  const dueFilter = searchParams.get('filter') === 'due'
  const clearDueFilter = () => setSearchParams({})

  // ── Project filter state (multi-select, empty = All) ──────────────────────
  const [ragFilters,      setRagFilters]      = useState<RagStatus[]>(() => loadArr('myworker:prime-rag2', []) as RagStatus[])
  const [priorityFilters, setPriorityFilters] = useState<string[]>(()   => loadArr('myworker:prime-priority2', []))
  const [statusFilters,   setStatusFilters]   = useState<string[]>(()   => loadArr('myworker:prime-status2', []))
  const [areaFilters,     setAreaFilters]     = useState<string[]>(()   => loadArr('myworker:prime-area2', []))
  const [areaFilterButtons]                   = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')

  // ── Project sort (multi-sort stack) ───────────────────────────────────────
  const [projectSorts, setProjectSorts] = useState<ProjectSortEntry[]>(() =>
    loadSorted<ProjectSortEntry>('myworker:prime-proj-sorts2', [{ key: 'workItem', dir: 'asc' }])
  )

  // ── Accordion expand state ─────────────────────────────────────────────────
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())

  // ── Right pane: general tasks ──────────────────────────────────────────────
  const [generalStatusFilters, setGeneralStatusFilters] = useState<string[]>(() =>
    loadArr('myworker:prime-gen-status2', ['active'])
  )
  const [showUpcoming,   setShowUpcoming]   = useState(false)
  const [generalSorts,   setGeneralSorts]   = useState<GeneralSortEntry[]>(() =>
    loadSorted<GeneralSortEntry>('myworker:prime-gen-sorts2', [{ key: 'due', dir: 'asc' }])
  )

  // Task modal for editing tasks
  const [editingTask, setEditingTask]   = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  // Controlled open state for task due-date popovers in the project rows
  const [openDueDatePopover, setOpenDueDatePopover] = useState<number | null>(null)

  // Project modal for creating projects
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  const { data, reload, patchData } = useDataLoader<PageData>(
    async () => {
      const [projects, priorities, productAreas, projectStatuses, allTasks, latestLogByProject] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
        getAllTasks(),
        getLatestWorkLogPerProject(),
      ])
      return { projects, priorities, productAreas, projectStatuses, allTasks, latestLogByProject }
    },
    'Failed to load Prime view',
  )

  const projects        = data?.projects        ?? []
  const priorities      = data?.priorities      ?? []
  const productAreas    = data?.productAreas    ?? []
  const projectStatuses = data?.projectStatuses ?? []
  const allTasks        = data?.allTasks        ?? []

  // Persist filter/sort state
  useEffect(() => { localStorage.setItem('myworker:prime-rag2',         JSON.stringify(ragFilters))      }, [ragFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-priority2',    JSON.stringify(priorityFilters)) }, [priorityFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-status2',      JSON.stringify(statusFilters))   }, [statusFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-area2',        JSON.stringify(areaFilters))     }, [areaFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-proj-sorts2',  JSON.stringify(projectSorts))    }, [projectSorts])
  useEffect(() => { localStorage.setItem('myworker:prime-gen-status2',  JSON.stringify(generalStatusFilters)) }, [generalStatusFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-gen-sorts2',   JSON.stringify(generalSorts))    }, [generalSorts])

  /** Latest work log entry per project */
  const latestLogByProjectMap = useMemo(() => {
    const map = new Map<number, WorkLogEntry>()
    for (const entry of (data?.latestLogByProject ?? [])) {
      map.set(entry.projectId, entry)
    }
    return map
  }, [data?.latestLogByProject])

  /** Project IDs that have at least one task matching the current search query */
  const projectIdsWithMatchingTasks = useMemo(() => {
    const ids = new Set<number>()
    if (!query.trim()) return ids
    const q = query.toLowerCase()
    for (const t of allTasks) {
      if (t.projectId === null) continue
      if (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      ) {
        ids.add(t.projectId)
      }
    }
    return ids
  }, [allTasks, query])

  /** Open/in-progress tasks grouped by projectId */
  const tasksByProject = useMemo(() => {
    const map = new Map<number, Task[]>()
    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysOut = new Date()
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
    const maxDate = sevenDaysOut.toISOString().slice(0, 10)
    const q = query.trim().toLowerCase()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      if (showUpcoming && (!t.dueDate || t.dueDate < today || t.dueDate > maxDate)) continue
      if (q && !(
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      )) continue
      const arr = map.get(t.projectId) ?? []
      arr.push(t)
      map.set(t.projectId, arr)
    }
    return map
  }, [allTasks, showUpcoming, query])

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

  /** Projects with at least one due or overdue open task */
  const projectsWithDueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId !== null && t.status !== 'done' && t.dueDate && t.dueDate <= today)
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks])

  // Auto-expand projects with due/overdue tasks when the due filter is active
  useEffect(() => {
    if (dueFilter && allTasks.length > 0) {
      setExpandedProjects(new Set(projectsWithDueTasks))
    }
  }, [dueFilter, allTasks, projectsWithDueTasks])

  // Auto-expand projects that appear in the list only because of a task match
  useEffect(() => {
    if (projectIdsWithMatchingTasks.size > 0) {
      setExpandedProjects(prev => {
        const next = new Set(prev)
        for (const id of projectIdsWithMatchingTasks) next.add(id)
        return next
      })
    }
  }, [projectIdsWithMatchingTasks])

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

  /** General tasks (no project), filtered and sorted */
  const generalTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    let list = allTasks.filter(t => t.projectId === null)


    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      )
    } else if (dueFilter) {
      list = list.filter(t => t.status !== 'done' && t.dueDate && t.dueDate <= today)
    } else if (showUpcoming) {
      const sevenDaysOut = new Date()
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
      const maxDate = sevenDaysOut.toISOString().slice(0, 10)
      list = list.filter(t => t.status !== 'done' && t.dueDate && t.dueDate >= today && t.dueDate <= maxDate)
    } else {
      // Area filter — skipped when inbox is active (inbox tasks have no area by definition)
      if (areaFilters.length > 0 && !generalStatusFilters.includes('inbox')) {
        const ids = areaFilters.map(Number)
        list = list.filter(t => t.productAreaId !== null && ids.includes(t.productAreaId))
      }
      // Status filter (multi-select; empty = all)
      if (generalStatusFilters.length > 0) {
        list = list.filter(t => {
          for (const f of generalStatusFilters) {
            if (f === 'active' && (t.status !== 'done' || t.updatedAt.slice(0, 10) === today)) return true
            if (f === 'inbox' && t.productAreaId === null) return true
            if (f === t.status) return true
          }
          return false
        })
      }
    }

    // Multi-sort
    list.sort((a, b) => {
      for (const { key, dir } of generalSorts) {
        let cmp = 0
        if (key === 'title') {
          const at = a.title.toLowerCase(), bt = b.title.toLowerCase()
          cmp = at < bt ? -1 : at > bt ? 1 : 0
        } else if (key === 'priority') {
          const ai = priorities.find(p => p.id === a.priorityId)?.sortOrder ?? 999
          const bi = priorities.find(p => p.id === b.priorityId)?.sortOrder ?? 999
          cmp = ai - bi
        } else { // due — nulls last regardless of direction
          if (!a.dueDate && !b.dueDate) cmp = 0
          else if (!a.dueDate) cmp = 1
          else if (!b.dueDate) cmp = -1
          else cmp = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
        }
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })

    return list
  }, [allTasks, query, dueFilter, showUpcoming, areaFilters, generalStatusFilters, generalSorts, priorities])

  /** Filtered + sorted projects */
  const filteredProjects = useMemo(() => {
    let list = [...projects]

    if (dueFilter) {
      list = list.filter(p => projectsWithDueTasks.has(p.id))
    } else if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(p =>
        p.workItem.toLowerCase().includes(q) ||
        p.latestStatus.toLowerCase().includes(q) ||
        projectIdsWithMatchingTasks.has(p.id)
      )
    } else {
      if (ragFilters.length > 0)      list = list.filter(p => ragFilters.includes(p.ragStatus))
      if (priorityFilters.length > 0) list = list.filter(p => priorityFilters.includes(String(p.priorityId ?? '')))
      if (areaFilters.length > 0)     list = list.filter(p => areaFilters.includes(String(p.productAreaId ?? '')))
      if (statusFilters.length > 0)   list = list.filter(p => statusFilters.includes(String(p.statusId ?? '')))
    }

    // Multi-sort
    list.sort((a, b) => {
      for (const { key, dir } of projectSorts) {
        let av: string | number = '', bv: string | number = ''
        switch (key) {
          case 'workItem':      av = a.workItem.toLowerCase();     bv = b.workItem.toLowerCase();     break
          case 'rag':           av = RAG_ORDER[a.ragStatus];       bv = RAG_ORDER[b.ragStatus];       break
          case 'priority':
            av = priorities.find(o => o.id === a.priorityId)?.sortOrder ?? 999
            bv = priorities.find(o => o.id === b.priorityId)?.sortOrder ?? 999; break
          case 'status':
            av = projectStatuses.find(o => o.id === a.statusId)?.sortOrder ?? 999
            bv = projectStatuses.find(o => o.id === b.statusId)?.sortOrder ?? 999; break
          case 'statusComment': av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
        }
        if (av < bv) return dir === 'asc' ? -1 : 1
        if (av > bv) return dir === 'asc' ? 1 : -1
      }
      return 0
    })

    return list
  }, [projects, query, dueFilter, projectsWithDueTasks, projectIdsWithMatchingTasks, ragFilters, priorityFilters, areaFilters, statusFilters, priorities, projectStatuses, projectSorts])

  const toggleProject = (id: number) =>
    setExpandedProjects(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const handleProjectSort = (col: ProjectSortKey) => {
    setProjectSorts(prev => {
      const existing = prev.find(s => s.key === col)
      if (!existing) return [...prev, { key: col, dir: 'asc' }]
      if (existing.dir === 'asc') return prev.map(s => s.key === col ? { ...s, dir: 'desc' as const } : s)
      return prev.filter(s => s.key !== col)
    })
  }

  const handleGeneralSort = (col: GeneralSortKey) => {
    setGeneralSorts(prev => {
      const existing = prev.find(s => s.key === col)
      if (!existing) return [...prev, { key: col, dir: 'asc' }]
      if (existing.dir === 'asc') return prev.map(s => s.key === col ? { ...s, dir: 'desc' as const } : s)
      return prev.filter(s => s.key !== col)
    })
  }

  const cycleTaskStatus = async (t: Task) => {
    const next: TaskStatus = t.status === 'open' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'open'
    await updateTask({ id: t.id, status: next })
    patchData(prev => ({ ...prev, allTasks: prev.allTasks.map(task => task.id === t.id ? { ...task, status: next } : task) }))
  }

  const savePriority = async (t: Task, priorityId: number | null) => {
    await updateTask({ id: t.id, priorityId })
    patchData(prev => ({ ...prev, allTasks: prev.allTasks.map(task => task.id === t.id ? { ...task, priorityId } : task) }))
  }

  const saveDueDate = async (t: Task, dueDate: Date | undefined) => {
    const val = dueDate ? dueDate.toISOString().slice(0, 10) : null
    await updateTask({ id: t.id, dueDate: val })
    patchData(prev => ({ ...prev, allTasks: prev.allTasks.map(task => task.id === t.id ? { ...task, dueDate: val } : task) }))
  }

  const saveProjectField = async (projectId: number, patch: Partial<Project>) => {
    try {
      await updateProject({ id: projectId, ...patch } as Parameters<typeof updateProject>[0])
      patchData(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === projectId ? { ...p, ...patch } : p),
      }))
    } catch (err) {
      toast.error(`Failed to update project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const { buttonColor, buttonOpacity } = loadGuiSettings()
  const btnStyle = buttonStyle(buttonColor, buttonOpacity)

  const hasActiveFilters = ragFilters.length > 0 || priorityFilters.length > 0 || areaFilters.length > 0 || statusFilters.length > 0

  const projectsWithTasks = filteredProjects.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0)
  const allExpanded = projectsWithTasks.length > 0 && projectsWithTasks.every(p => expandedProjects.has(p.id))

  // Options for filter components
  const ragOptions = RAG_OPTIONS.map(o => ({
    value: o.value,
    label: o.label,
    prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />,
  }))
  const priorityOptions = priorities.map(p => ({
    value: String(p.id),
    label: p.label,
    prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(p.color)}`} />,
  }))
  const statusOptions = projectStatuses.map(s => ({
    value: String(s.id),
    label: s.label,
    prefix: s.color ? <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(s.color)}`} /> : undefined,
  }))

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
        <MultiSelectFilter
          options={ragOptions}
          value={ragFilters}
          onChange={v => setRagFilters(v as RagStatus[])}
          placeholder="All RAG"
          width="w-28"
        />

        {/* Priority filter */}
        <MultiSelectFilter
          options={priorityOptions}
          value={priorityFilters}
          onChange={setPriorityFilters}
          placeholder="All Priorities"
          width="w-36"
        />

        {/* Status filter */}
        <MultiSelectFilter
          options={statusOptions}
          value={statusFilters}
          onChange={setStatusFilters}
          placeholder="All Statuses"
          width="w-36"
        />

        {hasActiveFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilters([]); setPriorityFilters([]); setAreaFilters([]); setStatusFilters([]) }}
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
              const isAll = opt.value === 'All'
              const isActive = isAll ? areaFilters.length === 0 : areaFilters.includes(opt.value)
              const anyActive = areaFilters.length > 0
              const coloredClass = isActive
                ? (opt.color ? pillClassActive(opt.color) : 'bg-primary text-primary-foreground border-primary')
                : anyActive && !isAll
                  ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  : (opt.color ? pillClass(opt.color) : 'border-input bg-background hover:bg-accent hover:text-accent-foreground')
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (isAll) {
                      setAreaFilters([])
                    } else {
                      setAreaFilters(prev =>
                        prev.includes(opt.value) ? prev.filter(x => x !== opt.value) : [...prev, opt.value]
                      )
                    }
                  }}
                  className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${coloredClass}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ) : (
          <MultiSelectFilter
            options={productAreas.map(a => ({ value: String(a.id), label: a.label }))}
            value={areaFilters}
            onChange={setAreaFilters}
            placeholder="All Areas"
            width="w-40"
          />
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
        initialProductAreaId={!editingTask && areaFilters.length === 1 ? Number(areaFilters[0]) : undefined}
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
    const SortInd = ({ col }: { col: ProjectSortKey }) => {
      const idx = projectSorts.findIndex(s => s.key === col)
      if (idx === -1) return null
      return (
        <span className="ml-1 opacity-50">
          {projectSorts.length > 1 ? idx + 1 : ''}{projectSorts[idx].dir === 'asc' ? '↑' : '↓'}
        </span>
      )
    }

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
    const latestLog  = latestLogByProjectMap.get(p.id)

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

          {/* RAG — inline editable */}
          <td className="w-px px-2 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity" title="Click to change RAG">
                  <RagBadge status={p.ragStatus} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-32 p-1" onClick={e => e.stopPropagation()}>
                {RAG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => saveProjectField(p.id, { ragStatus: opt.value })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${p.ragStatus === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotColor}`} />
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </td>

          {/* Priority — inline editable */}
          <td className="w-px px-2 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity" title="Click to change priority">
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
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => saveProjectField(p.id, { priorityId: null })}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                >
                  <Check className={`h-3 w-3 shrink-0 ${p.priorityId === null ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-muted-foreground">— None</span>
                </button>
                {priorities.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => saveProjectField(p.id, { priorityId: opt.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${p.priorityId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </td>

          {/* Status — inline editable */}
          <td className="w-px px-2 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity" title="Click to change status">
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
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => saveProjectField(p.id, { statusId: null })}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                >
                  <Check className={`h-3 w-3 shrink-0 ${p.statusId === null ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-muted-foreground">— None</span>
                </button>
                {projectStatuses.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => saveProjectField(p.id, { statusId: opt.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${p.statusId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                    {opt.color && <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </td>

          <td className="px-3 py-1.5 max-w-[14rem]">
            <span className="text-xs text-muted-foreground line-clamp-2">{p.latestStatus || '—'}</span>
          </td>
        </tr>

        {/* TR2 — latest work log entry (capped to work-item column to avoid horizontal scroll) */}
        <tr
          onClick={() => navigate(`/projects/${p.id}`)}
          className="group-hover/proj:bg-blue-50/40 dark:group-hover/proj:bg-blue-950/10 cursor-pointer transition-colors border-b border-border"
        >
          <td className="w-10" />
          <td className="px-3 pb-1.5 pt-0 overflow-hidden max-w-0">
            <span className="text-xs italic text-muted-foreground/70 truncate block pl-0">
              {latestLog ? latestLog.note : '—'}
            </span>
          </td>
          <td colSpan={4} />
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
                <Popover
                  open={openDueDatePopover === t.id}
                  onOpenChange={v => setOpenDueDatePopover(v ? t.id : null)}
                >
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
                      onSelect={d => { saveDueDate(t, d); setOpenDueDatePopover(null) }}
                    />
                    {t.dueDate && (
                      <div className="border-t p-2">
                        <button
                          className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                          onClick={() => { saveDueDate(t, undefined); setOpenDueDatePopover(null) }}
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
    const GenSortInd = ({ col }: { col: GeneralSortKey }) => {
      const idx = generalSorts.findIndex(s => s.key === col)
      if (idx === -1) return null
      return (
        <span className="opacity-50">
          {generalSorts.length > 1 ? idx + 1 : ''}{generalSorts[idx].dir === 'asc' ? '↑' : '↓'}
        </span>
      )
    }

    const genStatusOptions = [
      { value: 'active',      label: 'Active' },
      { value: 'open',        label: 'Open' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'done',        label: 'Done' },
      { value: 'inbox',       label: 'Inbox' },
    ]

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General Tasks</span>
          <MultiSelectFilter
            options={genStatusOptions}
            value={generalStatusFilters}
            onChange={next => {
              // 'inbox' is mutually exclusive with status filters
              const added = next.filter(x => !generalStatusFilters.includes(x))
              if (added.includes('inbox')) setGeneralStatusFilters(['inbox'])
              else setGeneralStatusFilters(next.filter(x => x !== 'inbox'))
            }}
            placeholder="Active"
            width="w-28"
          />
          {/* Upcoming toggle */}
          <button
            onClick={() => setShowUpcoming(v => !v)}
            className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${
              showUpcoming
                ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
                : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
            }`}
            title="Show tasks due in the next 7 days"
          >
            Upcoming
          </button>
          <span className="text-xs text-muted-foreground ml-auto">
            {generalTasks.length} task{generalTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-4 py-1 border-b bg-muted/20 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
          <span className="w-5 shrink-0" />
          <button onClick={() => handleGeneralSort('title')} className="flex-1 text-left hover:text-foreground transition-colors">
            Task<span className="ml-1"><GenSortInd col="title" /></span>
          </button>
          <button onClick={() => handleGeneralSort('priority')} className="w-4 text-center shrink-0 hover:text-foreground transition-colors">
            Pri<span className="ml-0.5"><GenSortInd col="priority" /></span>
          </button>
          <button onClick={() => handleGeneralSort('due')} className="w-14 text-right shrink-0 hover:text-foreground transition-colors">
            Due<span className="ml-1"><GenSortInd col="due" /></span>
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
    const today = new Date().toISOString().slice(0, 10)
    const completedToday = t.status === 'done' && t.updatedAt.slice(0, 10) === today
    const [dueDateOpen, setDueDateOpen] = useState(false)

    return (
      <div
        className={`px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer ${t.status === 'done' && !completedToday ? 'opacity-60' : ''}`}
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
            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
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
                  onSelect={d => { saveDueDate(t, d); setDueDateOpen(false) }}
                />
                {t.dueDate && (
                  <div className="border-t p-2">
                    <button
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                      onClick={() => { saveDueDate(t, undefined); setDueDateOpen(false) }}
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
