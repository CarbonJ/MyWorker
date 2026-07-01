import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getAllProjects, updateProject } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllTasks, updateTask } from '@/db/tasks'
import { getLatestWorkLogPerProject, addWorkLogEntry } from '@/db/workLog'
import { getSavedViewsForPage, upsertSavedView, deleteSavedView } from '@/db/savedViews'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry, TaskStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/contexts/SearchContext'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Check, Bookmark, X as XIcon, ChevronDown } from 'lucide-react'
import { pillClass, dotClass, pillClassActive, RAG_ORDER } from '@/lib/colors'
import { loadGuiSettings, buttonStyle, workItemStyle } from '@/lib/guiSettings'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useDataLoader } from '@/hooks/useDataLoader'
import { SplitPane } from '@/components/project/SplitPane'
import { TaskModal } from '@/components/TaskModal'
import { RecurringCompleteDialog } from '@/components/RecurringCompleteDialog'
import { ProjectModal } from '@/components/ProjectModal'
import { CalendarIcon, RotateCcw } from 'lucide-react'
import { MarkdownContent } from '@/components/MarkdownContent'

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

interface SavedView {
  name: string
  ragFilters: RagStatus[]
  priorityFilters: string[]
  statusFilters: string[]
  areaFilters: string[]
  tagFilters: string[]
}


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

/** Compute cutoff date string for the upcoming filter mode. */
function getUpcomingCutoff(mode: '1' | '3' | 'week'): string {
  const d = new Date()
  if (mode === '1') {
    d.setDate(d.getDate() + 1)
  } else if (mode === '3') {
    d.setDate(d.getDate() + 3)
  } else {
    // End of current business week (this Friday; if Sat/Sun, next Friday)
    const day = d.getDay() // 0=Sun…6=Sat
    const daysToFriday = day === 0 ? 5 : day === 6 ? 6 : 5 - day
    d.setDate(d.getDate() + daysToFriday)
  }
  return d.toISOString().slice(0, 10)
}

export default function Prime() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { query } = useSearch()

  // Due filter from URL (?filter=due)
  const dueFilter = searchParams.get('filter') === 'due'
  const toggleDueFilter = () => dueFilter ? setSearchParams({}) : setSearchParams({ filter: 'due' })

  // ── Project filter state (multi-select, empty = All) ──────────────────────
  const [ragFilters,      setRagFilters]      = useState<RagStatus[]>(() => loadArr('myworker:prime-rag2', []) as RagStatus[])
  const [priorityFilters, setPriorityFilters] = useState<string[]>(()   => loadArr('myworker:prime-priority2', []))
  const [statusFilters,   setStatusFilters]   = useState<string[]>(()   => loadArr('myworker:prime-status2', []))
  const [areaFilters,     setAreaFilters]     = useState<string[]>(()   => loadArr('myworker:prime-area2', []))
  const [tagFilters,      setTagFilters]      = useState<string[]>(()   => loadArr('myworker:prime-tags2', []))
  const [areaFilterButtons]                   = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')
  const [savedViews,      setSavedViews]      = useState<SavedView[]>([])
  const [saveViewName,    setSaveViewName]    = useState('')
  const [viewsOpen,       setViewsOpen]       = useState(false)

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
  const [upcomingMode, setUpcomingMode] = useState<null | '1' | '3' | 'week'>(() => {
    const v = localStorage.getItem('myworker:upcoming-mode')
    return (v === '1' || v === '3' || v === 'week') ? v : null
  })
  const [dueFilterShowAll, setDueFilterShowAll] = useState(
    () => localStorage.getItem('myworker:due-filter-show-all') === 'true'
  )
  const [generalSorts,   setGeneralSorts]   = useState<GeneralSortEntry[]>(() =>
    loadSorted<GeneralSortEntry>('myworker:prime-gen-sorts2', [{ key: 'due', dir: 'asc' }])
  )

  // Task modal for editing tasks
  const [editingTask, setEditingTask]   = useState<Task | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  // Recurring task completion dialog
  const [recurringTask, setRecurringTask] = useState<Task | null>(null)

  // Controlled open state for task due-date popovers in the project rows
  const [openDueDatePopover, setOpenDueDatePopover] = useState<number | null>(null)

  // Project modal for creating projects
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)

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

  // Reload settings-driven state when changed in Settings
  useEffect(() => {
    const handler = () => setDueFilterShowAll(localStorage.getItem('myworker:due-filter-show-all') === 'true')
    window.addEventListener('myworker:gui-settings-changed', handler)
    return () => window.removeEventListener('myworker:gui-settings-changed', handler)
  }, [])

  // Reload when a task is saved via the global modal (Cmd+Shift+T / Command Palette)
  useEffect(() => {
    window.addEventListener('myworker:task-saved', reload)
    return () => window.removeEventListener('myworker:task-saved', reload)
  }, [reload])

  // Persist filter/sort state
  useEffect(() => { localStorage.setItem('myworker:prime-rag2',         JSON.stringify(ragFilters))      }, [ragFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-priority2',    JSON.stringify(priorityFilters)) }, [priorityFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-status2',      JSON.stringify(statusFilters))   }, [statusFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-area2',        JSON.stringify(areaFilters))     }, [areaFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-tags2',        JSON.stringify(tagFilters))      }, [tagFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-proj-sorts2',  JSON.stringify(projectSorts))    }, [projectSorts])
  useEffect(() => { localStorage.setItem('myworker:prime-gen-status2',  JSON.stringify(generalStatusFilters)) }, [generalStatusFilters])
  useEffect(() => { localStorage.setItem('myworker:prime-gen-sorts2',   JSON.stringify(generalSorts))    }, [generalSorts])

  // Load saved views from DB (migrate one-time from localStorage if present)
  useEffect(() => {
    const load = async () => {
      const lsRaw = localStorage.getItem('myworker:saved-views')
      if (lsRaw) {
        try {
          const lsViews: SavedView[] = JSON.parse(lsRaw) ?? []
          for (const v of lsViews) await upsertSavedView('prime', v.name, JSON.stringify(v))
        } catch {}
        localStorage.removeItem('myworker:saved-views')
      }
      const rows = await getSavedViewsForPage('prime')
      setSavedViews(rows.map(r => JSON.parse(r.data) as SavedView))
    }
    load().catch(console.error)
  }, [])

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
    const upcomingCutoff = upcomingMode ? getUpcomingCutoff(upcomingMode) : null
    const q = query.trim().toLowerCase()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      // Due filter: hide tasks with no active due date AND no started start date (unless show-all enabled)
      if (dueFilter && !dueFilterShowAll &&
          (!t.dueDate || t.dueDate > today) &&
          (!t.startDate || t.startDate > today)) continue
      // Upcoming filter: include tasks where dueDate OR startDate falls within the window
      if (upcomingMode && upcomingCutoff) {
        const dueFits = !!t.dueDate && t.dueDate >= today && t.dueDate <= upcomingCutoff
        const startFits = !!t.startDate && t.startDate >= today && t.startDate <= upcomingCutoff
        if (upcomingMode === 'week') {
          const dueWeekday = dueFits && (() => { const d = new Date(t.dueDate! + 'T12:00:00').getDay(); return d !== 0 && d !== 6 })()
          const startWeekday = startFits && (() => { const d = new Date(t.startDate! + 'T12:00:00').getDay(); return d !== 0 && d !== 6 })()
          if (!dueWeekday && !startWeekday) continue
        } else {
          if (!dueFits && !startFits) continue
        }
      }
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
  }, [allTasks, upcomingMode, dueFilter, dueFilterShowAll, query])

  /** Set of non-archived project IDs — used to exclude archived-project tasks from due counts */
  const activeProjectIds = useMemo(() => new Set(projects.map(p => p.id)), [projects])

  /** Projects with at least one overdue open task */
  const overdueProjectIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId !== null && t.status !== 'done' && t.dueDate && t.dueDate < today &&
          activeProjectIds.has(t.projectId))
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks, activeProjectIds])

  /** Projects with at least one due/overdue open task, or an open task whose start date has arrived */
  const projectsWithDueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      if (!activeProjectIds.has(t.projectId)) continue
      if ((t.dueDate && t.dueDate <= today) || (t.startDate && t.startDate <= today))
        ids.add(t.projectId)
    }
    return ids
  }, [allTasks, activeProjectIds])

  const dueTaskCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTasks.filter(t =>
      t.status !== 'done' &&
      (t.projectId === null || activeProjectIds.has(t.projectId)) &&
      ((t.dueDate && t.dueDate <= today) || (t.startDate && t.startDate <= today))
    ).length
  }, [allTasks, activeProjectIds])

  // Auto-expand projects with due/overdue tasks when the due filter is active
  useEffect(() => {
    if (dueFilter && allTasks.length > 0) {
      setExpandedProjects(new Set(projectsWithDueTasks))
    }
  }, [dueFilter, allTasks, projectsWithDueTasks])

  // Auto-expand projects with upcoming tasks when an upcoming filter is active
  useEffect(() => {
    if (upcomingMode && allTasks.length > 0) {
      setExpandedProjects(new Set(tasksByProject.keys()))
    }
  }, [upcomingMode, allTasks, tasksByProject])

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
      list = list.filter(t => t.status !== 'done' && (
        (t.dueDate && t.dueDate <= today) || (t.startDate && t.startDate <= today)
      ))
    } else if (upcomingMode) {
      const upcomingCutoff = getUpcomingCutoff(upcomingMode)
      list = list.filter(t => {
        if (t.status === 'done') return false
        const dueFits = !!t.dueDate && t.dueDate >= today && t.dueDate <= upcomingCutoff
        const startFits = !!t.startDate && t.startDate >= today && t.startDate <= upcomingCutoff
        if (upcomingMode === 'week') {
          const dueWeekday = dueFits && (() => { const d = new Date(t.dueDate! + 'T12:00:00').getDay(); return d !== 0 && d !== 6 })()
          const startWeekday = startFits && (() => { const d = new Date(t.startDate! + 'T12:00:00').getDay(); return d !== 0 && d !== 6 })()
          return !!(dueWeekday || startWeekday)
        }
        return dueFits || startFits
      })
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
      // Tag filter
      if (tagFilters.length > 0) {
        list = list.filter(t => tagFilters.some(tf => t.tags.some(tag => tag.toLowerCase() === tf.toLowerCase())))
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
  }, [allTasks, query, dueFilter, upcomingMode, areaFilters, generalStatusFilters, tagFilters, generalSorts, priorities])

  /** Filtered + sorted projects */
  const filteredProjects = useMemo(() => {
    let list = [...projects]

    if (dueFilter) {
      list = list.filter(p => projectsWithDueTasks.has(p.id))
    } else if (upcomingMode) {
      list = list.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0)
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
      if (tagFilters.length > 0)      list = list.filter(p => {
        const projectTasks = tasksByProject.get(p.id) ?? []
        return tagFilters.some(tf =>
          p.tags.some(t => t.toLowerCase() === tf.toLowerCase()) ||
          projectTasks.some(task => task.tags.some(t => t.toLowerCase() === tf.toLowerCase()))
        )
      })
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
  }, [projects, query, dueFilter, upcomingMode, projectsWithDueTasks, projectIdsWithMatchingTasks, ragFilters, priorityFilters, areaFilters, statusFilters, tagFilters, priorities, projectStatuses, projectSorts, tasksByProject])

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
    // Intercept in_progress → done for recurring tasks
    if (t.status === 'in_progress' && t.isRecurring) {
      setRecurringTask(t)
      return
    }
    await updateTask({ id: t.id, status: next })
    if (next === 'done' && t.projectId) {
      await addWorkLogEntry(t.projectId, `✓ Completed: ${t.title}`)
      // Full reload needed to refresh latestLogByProject after the work log entry is added
      reload()
      return
    }
    patchData(prev => ({ ...prev, allTasks: prev.allTasks.map(task => task.id === t.id ? { ...task, status: next } : task) }))
  }

  const handleReschedule = async (newDueDate: string, note: string) => {
    if (!recurringTask) return
    try {
      await updateTask({ id: recurringTask.id, status: 'open', dueDate: newDueDate })
      if (recurringTask.projectId) {
        const logNote = `✓ Completed: ${recurringTask.title}. Next due: ${fmtDate(newDueDate)}${note ? `. ${note}` : ''}`
        await addWorkLogEntry(recurringTask.projectId, logNote)
      }
      reload()
    } finally {
      setRecurringTask(null)
    }
  }

  const handleMarkDonePermanently = async () => {
    if (!recurringTask) return
    try {
      await updateTask({ id: recurringTask.id, status: 'done', isRecurring: false })
      reload()
    } finally {
      setRecurringTask(null)
    }
  }

  const assignTaskToProject = async (taskId: number, projectId: number) => {
    const task = allTasks.find(t => t.id === taskId)
    if (!task) return
    const projectName = projects.find(p => p.id === projectId)?.workItem ?? 'project'
    try {
      await updateTask({ id: taskId, projectId })
      patchData(prev => ({
        ...prev,
        allTasks: prev.allTasks.map(t =>
          t.id === taskId ? { ...t, projectId, productAreaId: null } : t
        ),
      }))
      toast.success(`"${task.title}" assigned to ${projectName}`)
    } catch (err) {
      toast.error(`Failed to assign task: ${err instanceof Error ? err.message : String(err)}`)
    }
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

  const guiSettings = loadGuiSettings()
  const btnStyle    = buttonStyle(guiSettings.buttonColor, guiSettings.buttonOpacity)
  const wiStyle     = workItemStyle(guiSettings)

  const hasActiveFilters = ragFilters.length > 0 || priorityFilters.length > 0 || areaFilters.length > 0 || statusFilters.length > 0 || tagFilters.length > 0

  const saveCurrentView = async () => {
    const name = saveViewName.trim()
    if (!name) return
    const view: SavedView = { name, ragFilters, priorityFilters, statusFilters, areaFilters, tagFilters }
    await upsertSavedView('prime', name, JSON.stringify(view))
    setSavedViews(prev => [...prev.filter(v => v.name !== name), view])
    setSaveViewName('')
    setViewsOpen(false)
    toast.success(`View "${name}" saved`)
  }

  const applyView = (view: SavedView) => {
    setRagFilters(view.ragFilters)
    setPriorityFilters(view.priorityFilters)
    setStatusFilters(view.statusFilters)
    setAreaFilters(view.areaFilters)
    setTagFilters(view.tagFilters)
    // Clear modes that bypass the filter logic in filteredProjects
    setUpcomingMode(null)
    localStorage.setItem('myworker:upcoming-mode', '')
    setViewsOpen(false)
  }

  const deleteView = async (name: string) => {
    await deleteSavedView('prime', name)
    setSavedViews(prev => prev.filter(v => v.name !== name))
  }

  // All unique tags from projects + tasks — for the tags filter dropdown
  const allProjectTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const p of projects) for (const t of p.tags) tagSet.add(t)
    for (const t of allTasks)  for (const tag of t.tags) tagSet.add(tag)
    return [...tagSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [projects, allTasks])

  const projectsWithTasks = filteredProjects.filter(p => (tasksByProject.get(p.id)?.length ?? 0) > 0)

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

        {/* Due/Overdue toggle button */}
        <button
          onClick={toggleDueFilter}
          className={`h-8 px-3 text-sm rounded-md border font-medium transition-colors whitespace-nowrap ${
            dueFilter
              ? 'bg-amber-200 border-amber-400 text-amber-900 hover:bg-amber-300'
              : dueTaskCount > 0
                ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                : 'bg-muted border-border text-muted-foreground/50 hover:bg-accent'
          }`}
          title={dueFilter ? 'Clear due/overdue filter' : 'Show due and overdue tasks'}
        >
          ⚠ Due/Overdue{dueTaskCount > 0 ? ` (${dueTaskCount})` : ''}
        </button>

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

        {/* Tags filter */}
        <MultiSelectFilter
          options={allProjectTags.map(t => ({ value: t, label: t }))}
          value={tagFilters}
          onChange={setTagFilters}
          placeholder="All Tags"
          width="w-32"
          searchable
        />

        {hasActiveFilters && (
          <Button
            variant="ghost" size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilters([]); setPriorityFilters([]); setAreaFilters([]); setStatusFilters([]); setTagFilters([]) }}
          >
            ✕ Reset filters
          </Button>
        )}

        {/* Views dropdown — save + apply */}
        <Popover open={viewsOpen} onOpenChange={setViewsOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded-md hover:bg-accent transition-colors"
              title="Saved views"
            >
              <Bookmark className="h-3.5 w-3.5" />
              {savedViews.length > 0 ? (
                <span className="font-medium">{savedViews.length} view{savedViews.length !== 1 ? 's' : ''}</span>
              ) : (
                <span>Views</span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            {savedViews.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground px-1 mb-1">Apply a view</p>
                <div className="flex flex-col gap-0.5 mb-2">
                  {savedViews.map(view => (
                    <div key={view.name} className="flex items-center gap-0.5 group/view rounded hover:bg-accent transition-colors">
                      <button
                        onClick={() => applyView(view)}
                        className="flex-1 text-left text-xs px-2 py-1.5 truncate"
                        title={`Apply view: ${view.name}`}
                      >
                        {view.name}
                      </button>
                      <button
                        onClick={() => deleteView(view.name)}
                        className="p-1.5 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/view:opacity-100 transition-all rounded shrink-0"
                        title={`Delete "${view.name}"`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t mb-2" />
              </>
            )}
            <p className="text-xs font-medium px-1 mb-1.5">Save current filters</p>
            <div className="flex gap-1.5">
              <Input
                value={saveViewName}
                onChange={e => setSaveViewName(e.target.value)}
                placeholder="e.g. Red + Platform"
                className="h-7 text-xs flex-1"
                onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); if (e.key === 'Escape') setViewsOpen(false) }}
                autoFocus
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={saveCurrentView} disabled={!saveViewName.trim()}>
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Expand / Collapse all — right side */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setExpandedProjects(new Set(projectsWithTasks.map(p => p.id)))}
            className="h-8 px-2 flex items-center justify-center border rounded-md text-sm hover:bg-accent transition-colors"
            title="Expand all projects"
          >
            +
          </button>
          <button
            onClick={() => setExpandedProjects(new Set())}
            className="h-8 px-2 flex items-center justify-center border rounded-md text-sm hover:bg-accent transition-colors"
            title="Collapse all projects"
          >
            −
          </button>
        </div>
      </div>

      {/* ── Toolbar row 2 — Area filter + Upcoming ── */}
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
                        prev.length === 1 && prev[0] === opt.value ? [] : [opt.value]
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
        {/* Upcoming toggle group */}
        <div className="ml-auto flex items-center gap-1">
          {(['1', '3', 'week'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => {
                const next = upcomingMode === mode ? null : mode
                setUpcomingMode(next)
                localStorage.setItem('myworker:upcoming-mode', next ?? '')
              }}
              className={`h-7 px-2.5 text-xs rounded-full border transition-colors whitespace-nowrap ${
                upcomingMode === mode
                  ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-200'
                  : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
              title={mode === '1' ? 'Due tomorrow' : mode === '3' ? 'Due in next 3 days' : 'Due this business week (Mon–Fri)'}
            >
              {mode === '1' ? 'Tomorrow' : mode === '3' ? '3 days' : 'Week'}
            </button>
          ))}
        </div>
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

      {recurringTask && (
        <RecurringCompleteDialog
          task={recurringTask}
          open={!!recurringTask}
          onReschedule={handleReschedule}
          onMarkDone={handleMarkDonePermanently}
          onCancel={() => setRecurringTask(null)}
        />
      )}

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
      if (idx === -1) return <span className="ml-1 opacity-30">↕</span>
      const { dir } = projectSorts[idx]
      return (
        <span className={`ml-1 ${dir === 'asc' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-500'}`}>
          {projectSorts.length > 1 ? <sup className="text-[9px] mr-px">{idx + 1}</sup> : null}{dir === 'asc' ? '↑' : '↓'}
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
      <tbody
        className="group/proj"
        onDragOver={e => {
          if (!e.dataTransfer.types.includes('application/x-task-id')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          e.currentTarget.classList.add('outline', 'outline-2', 'outline-blue-400', '-outline-offset-2')
        }}
        onDragLeave={e => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          e.currentTarget.classList.remove('outline', 'outline-2', 'outline-blue-400', '-outline-offset-2')
        }}
        onDrop={e => {
          e.currentTarget.classList.remove('outline', 'outline-2', 'outline-blue-400', '-outline-offset-2')
          const rawId = e.dataTransfer.getData('application/x-task-id')
          if (!rawId) return
          const taskId = Number(rawId)
          if (Number.isNaN(taskId)) return
          e.preventDefault()
          assignTaskToProject(taskId, p.id)
        }}
      >
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
              <span className="truncate" style={wiStyle} title={p.workItem}>{p.workItem}</span>
              {(hasOverdue || (!isExpanded && counts && (counts.open > 0 || counts.inProgress > 0))) && (
                <span className="flex items-center gap-1.5 font-normal">
                  {hasOverdue && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                      🗓 Overdue
                    </span>
                  )}
                  {!isExpanded && counts && (counts.open > 0 || counts.inProgress > 0) && (
                    <span className="text-xs text-muted-foreground">
                      {counts.open > 0 && <span>{counts.open} open</span>}
                      {counts.open > 0 && counts.inProgress > 0 && <span> · </span>}
                      {counts.inProgress > 0 && <span className="text-blue-600">{counts.inProgress} active</span>}
                    </span>
                  )}
                </span>
              )}
              {p.tags.length > 0 && (
                <span className="flex flex-wrap gap-0.5 font-normal" onClick={e => e.stopPropagation()}>
                  {p.tags.slice(0, 3).map((tag, i) => (
                    <button
                      key={i}
                      onClick={() => setTagFilters(prev => prev.includes(tag) ? prev : [...prev, tag])}
                      className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors"
                      title={`Filter by tag: ${tag}`}
                    >
                      {tag}
                    </button>
                  ))}
                  {p.tags.length > 3 && (
                    <span className="text-[10px] text-muted-foreground self-center">+{p.tags.length - 3}</span>
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
            <div className="truncate text-muted-foreground/70 [&_.prose]:!text-xs [&_p]:m-0 [&_p]:inline">
              {latestLog
                ? <MarkdownContent>{latestLog.note.split('\n')[0]}</MarkdownContent>
                : <span className="text-xs">—</span>}
            </div>
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
              className="bg-muted/20 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 transition-colors cursor-pointer border-b border-border/60"
              onClick={() => { setEditingTask(t); setTaskModalOpen(true) }}
            >
              <td className="w-10" />
              <td className="px-3 py-1.5 pl-7" colSpan={4}>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
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
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate min-w-0" title={t.title}>{t.title}</span>
                  </div>
                  {t.notes && (
                    <p className="text-xs text-muted-foreground truncate leading-tight pl-5" title={t.notes}>{t.notes.split('\n')[0]}</p>
                  )}
                </div>
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
                      title={t.dueDate ? `Due ${fmtDate(t.dueDate)} — click to change` : t.startDate ? `Start ${fmtDate(t.startDate)} — click to set due date` : 'Set due date'}
                    >
                      {t.dueDate ? (
                        <span className={`text-xs whitespace-nowrap ${
                          isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                          isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                          'text-muted-foreground'
                        }`}>
                          {fmtDate(t.dueDate)}
                        </span>
                      ) : t.startDate ? (
                        <span className="text-xs whitespace-nowrap text-muted-foreground/50">
                          {fmtDate(t.startDate)}
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
                    <div className="border-t px-3 py-2 flex gap-2">
                      <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, undefined); setOpenDueDatePopover(null) }}>Clear</button>
                      <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, new Date()); setOpenDueDatePopover(null) }}>Today</button>
                      <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, new Date(Date.now() + 86400000)); setOpenDueDatePopover(null) }}>Tomorrow</button>
                    </div>
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
      if (idx === -1) return <span className="opacity-30">↕</span>
      const { dir } = generalSorts[idx]
      return (
        <span className={dir === 'asc' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-500'}>
          {generalSorts.length > 1 ? <sup className="text-[9px] mr-px">{idx + 1}</sup> : null}{dir === 'asc' ? '↑' : '↓'}
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
          <div className="shrink-0 flex items-center gap-1.5">
            <button onClick={() => handleGeneralSort('priority')} className="w-8 text-center hover:text-foreground transition-colors whitespace-nowrap">
              Pri<span className="ml-0.5"><GenSortInd col="priority" /></span>
            </button>
            <button onClick={() => handleGeneralSort('due')} className="w-14 text-right hover:text-foreground transition-colors whitespace-nowrap">
              Due<span className="ml-1"><GenSortInd col="due" /></span>
            </button>
          </div>
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
        className={`px-4 py-2 hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing select-none ${t.status === 'done' && !completedToday ? 'opacity-60' : ''} ${draggedTaskId === t.id ? 'opacity-40 ring-1 ring-inset ring-blue-300' : ''}`}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-task-id', String(t.id))
          e.dataTransfer.effectAllowed = 'move'
          setTimeout(() => setDraggedTaskId(t.id), 0)
        }}
        onDragEnd={() => setDraggedTaskId(null)}
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
                  title={t.dueDate ? `Due ${fmtDate(t.dueDate)} — click to change` : t.startDate ? `Start ${fmtDate(t.startDate)} — click to set due date` : 'Set due date'}
                >
                  {t.dueDate ? (
                    <span className={`text-xs whitespace-nowrap ${
                      isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                      isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                      'text-muted-foreground'
                    }`}>
                      {fmtDate(t.dueDate)}
                    </span>
                  ) : t.startDate ? (
                    <span className="text-xs whitespace-nowrap text-muted-foreground/50">
                      {fmtDate(t.startDate)}
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
                <div className="border-t px-3 py-2 flex gap-2">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, undefined); setDueDateOpen(false) }}>Clear</button>
                  <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, new Date()); setDueDateOpen(false) }}>Today</button>
                  <button className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => { saveDueDate(t, new Date(Date.now() + 86400000)); setDueDateOpen(false) }}>Tomorrow</button>
                </div>
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
