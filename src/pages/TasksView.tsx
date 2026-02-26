import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getAllTasks, createTask, updateTask } from '@/db/tasks'
import { getAllProjectsIncludingArchived } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Task, TaskStatus, Project, DropdownOption } from '@/types'
import { TaskModal } from '@/components/TaskModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Check } from 'lucide-react'

import { pillClass, pillClassActive, dotClass, textClass } from '@/lib/colors'
import { useDataLoader } from '@/hooks/useDataLoader'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { useSearch } from '@/contexts/SearchContext'


function cycleStatus(current: TaskStatus): TaskStatus {
  if (current === 'open')        return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'open'
}

/** Returns the effective product area ID for a task.
 *  - Project tasks: area is inherited from the project.
 *  - Area tasks (no project): area is set directly on the task.
 *  - Inbox tasks (no project, no area): returns null. */
function resolveAreaId(task: Task, projects: Project[]): number | null {
  if (task.projectId !== null) {
    return projects.find(p => p.id === task.projectId)?.productAreaId ?? null
  }
  return task.productAreaId
}

function StatusCircle({ status }: { status: TaskStatus }) {
  if (status === 'done') return (
    <span className="w-5 h-5 rounded-md bg-green-500 border-2 border-green-500 flex items-center justify-center text-white text-[10px] font-bold leading-none">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-5 h-5 rounded-md border-2 border-blue-500 flex items-center justify-center">
      <span className="w-2 h-2 rounded-sm bg-blue-500" />
    </span>
  )
  return <span className="w-5 h-5 rounded-md border-2 border-slate-300" />
}


const AREA_BTN_KEY = 'myworker:area-filter-buttons'

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskSortField = 'project' | 'status' | 'priority' | 'dueDate'
type SortDir = 'asc' | 'desc'

interface PageData {
  tasks: Task[]
  projects: Project[]
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TasksView() {
  const navigate = useNavigate()
  const { query } = useSearch()
  const { handleError } = useErrorHandler()
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask,   setEditingTask]   = useState<Task | null>(null)

  // Inbox quick-add
  const [inboxDraft, setInboxDraft] = useState('')

  // Read initial filter from URL (?filter=due)
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') === 'due' ? 'due' : 'active'

  // Filters & sort
  const [filterStatus,   setFilterStatus]   = useState<string>(initialFilter)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterProject,  setFilterProject]  = useState<string>('all')
  const [filterArea,     setFilterArea]     = useState<string>(() => localStorage.getItem('myworker:tasks-filter-area') ?? 'all')
  const [sortField,      setSortField]      = useState<TaskSortField>('dueDate')
  const [sortDir,        setSortDir]        = useState<SortDir>('asc')

  // UI preference: show area filter as pill buttons instead of a dropdown
  const [areaFilterButtons] = useState(
    () => localStorage.getItem(AREA_BTN_KEY) === 'true'
  )

  const { data, reload: load } = useDataLoader<PageData>(
    async () => {
      const [tasks, projects, priorities, productAreas] = await Promise.all([
        getAllTasks(),
        getAllProjectsIncludingArchived(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      return { tasks, projects, priorities, productAreas }
    },
    'Failed to load tasks',
  )

  const tasks        = data?.tasks        ?? []
  const projects     = data?.projects     ?? []
  const priorities   = data?.priorities   ?? []
  const productAreas = data?.productAreas ?? []

  // Reload when a task is saved from the global quick-add shortcut (Cmd+L)
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('myworker:task-saved', handler)
    return () => window.removeEventListener('myworker:task-saved', handler)
  }, [load])

  // When area filter changes, reset project filter if the selected project is no longer in scope
  useEffect(() => {
    if (filterProject === 'all' || filterProject === 'inbox') return
    if (filterArea === 'all') return
    if (filterArea === 'inbox') { setFilterProject('all'); return }
    const areaId = Number(filterArea)
    const proj = projects.find(p => String(p.id) === filterProject)
    if (proj && proj.productAreaId !== areaId) setFilterProject('all')
  }, [filterArea]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist area filter so CMD+L can pre-populate it when opening from this screen
  useEffect(() => {
    localStorage.setItem('myworker:tasks-filter-area', filterArea)
  }, [filterArea])

  // Projects visible in the Project filter dropdown — scoped to the selected area
  const projectsForFilter = useMemo(() => {
    if (filterArea === 'all') return projects
    if (filterArea === 'inbox') return []   // inbox tasks have no project
    const areaId = Number(filterArea)
    return projects.filter(p => p.productAreaId === areaId)
  }, [projects, filterArea])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const addInboxTask = async () => {
    if (!inboxDraft.trim()) return
    try {
      await createTask({ projectId: null, title: inboxDraft.trim() })
      setInboxDraft('')
      await load()
    } catch (err) {
      handleError(err, 'Failed to add task')
    }
  }

  const cycleTaskStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    try {
      await updateTask({ id: task.id, status: cycleStatus(task.status) })
      await load()
    } catch (err) {
      handleError(err, 'Failed to update task')
    }
  }

  const toggleSort = (field: TaskSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // ── Derived list ────────────────────────────────────────────────────────────

  const visibleTasks = useMemo(() => {
    let list = [...tasks]

    // Global search filter
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (filterStatus === 'active') {
      list = list.filter(t => t.status !== 'done')
    } else if (filterStatus === 'due') {
      const today = new Date().toISOString().slice(0, 10)
      list = list.filter(t => t.status !== 'done' && t.dueDate !== null && t.dueDate <= today)
    } else if (filterStatus !== 'all') {
      list = list.filter(t => t.status === filterStatus)
    }

    // Priority filter
    if (filterPriority !== 'all') {
      const pid = filterPriority === 'none' ? null : Number(filterPriority)
      list = list.filter(t => t.priorityId === pid)
    }

    // Project filter
    if (filterProject === 'inbox') {
      list = list.filter(t => t.projectId === null)
    } else if (filterProject !== 'all') {
      list = list.filter(t => String(t.projectId) === filterProject)
    }

    // Product area filter — 'inbox' = no project AND no direct area; numeric = match resolved area
    if (filterArea === 'inbox') {
      list = list.filter(t => t.projectId === null && t.productAreaId === null)
    } else if (filterArea !== 'all') {
      const areaId = Number(filterArea)
      list = list.filter(t => resolveAreaId(t, projects) === areaId)
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'status') {
        const order: Record<string, number> = { open: 0, in_progress: 1, done: 2 }
        cmp = order[a.status] - order[b.status]
      } else if (sortField === 'priority') {
        const ai = priorities.findIndex(p => p.id === a.priorityId)
        const bi = priorities.findIndex(p => p.id === b.priorityId)
        cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      } else if (sortField === 'project') {
        const an = a.projectId ? (projects.find(p => p.id === a.projectId)?.workItem ?? '') : ''
        const bn = b.projectId ? (projects.find(p => p.id === b.projectId)?.workItem ?? '') : ''
        cmp = an.toLowerCase() < bn.toLowerCase() ? -1 : an.toLowerCase() > bn.toLowerCase() ? 1 : 0
      } else {
        const ad = a.dueDate ?? '9999-99-99'
        const bd = b.dueDate ?? '9999-99-99'
        cmp = ad < bd ? -1 : ad > bd ? 1 : 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [tasks, query, filterStatus, filterPriority, filterProject, filterArea, sortField, sortDir, priorities, projects, productAreas])

  // ── Render ───────────────────────────────────────────────────────────────────

  const SortBtn = ({ field, label, align = 'left' }: { field: TaskSortField; label: string; align?: 'left' | 'right' }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`hover:text-foreground tabular-nums text-${align}`}
    >
      {label}{sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── Inbox quick-add ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b bg-muted/30">
        <Input
          placeholder="Quick add to inbox — press Enter or click Add…"
          value={inboxDraft}
          onChange={e => setInboxDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addInboxTask() }}
          className="max-w-lg"
        />
        <Button size="sm" onClick={addInboxTask} disabled={!inboxDraft.trim()}>
          Add
        </Button>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-2 border-b flex-wrap">
        {/* Status */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="due">Due / Overdue</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        {/* Priority */}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="All priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="none">No priority</SelectItem>
            {priorities.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass(p.color)}`} />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Project — list scoped to the selected area */}
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {filterArea !== 'inbox' && (
              <SelectItem value="inbox">Inbox (unassigned)</SelectItem>
            )}
            {projectsForFilter.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.workItem}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Product Area — dropdown or pill buttons depending on user preference */}
        {areaFilterButtons ? (
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { value: 'inbox', label: 'Inbox', color: '' },
              ...productAreas.map(a => ({ value: String(a.id), label: a.label, color: a.color })),
            ].map(opt => {
              const anyActive = filterArea !== 'all'
              const isActive = filterArea === opt.value
              const coloredClass = isActive
                ? (opt.color ? pillClassActive(opt.color) : 'bg-primary text-primary-foreground border-primary')
                : anyActive
                  ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  : (opt.color ? pillClass(opt.color) : 'border-input bg-background hover:bg-accent hover:text-accent-foreground')
              return (
                <button
                  key={opt.value}
                  onClick={() => setFilterArea(isActive ? 'all' : opt.value)}
                  className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${coloredClass}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        ) : (
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="All areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              <SelectItem value="inbox">Inbox (no area)</SelectItem>
              {productAreas.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(filterStatus !== 'active' || filterPriority !== 'all' || filterProject !== 'all' || filterArea !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setFilterStatus('active'); setFilterPriority('all'); setFilterProject('all'); setFilterArea('all') }}
          >
            ✕ Reset filters
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Column headers ──────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-[1.5rem_minmax(0,50%)_6rem_12rem_5.5rem_5.5rem] gap-3 px-10 py-1 text-sm font-semibold text-muted-foreground border-b">
        <span />
        <span>Title</span>
        <span>Area</span>
        <SortBtn field="project" label="Project" />
        <SortBtn field="priority" label="Priority" />
        <SortBtn field="dueDate" label="Due" align="right" />
      </div>

      {/* ── Task rows ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {visibleTasks.length === 0 && (
          <p className="px-6 py-12 text-sm text-muted-foreground text-center">No tasks.</p>
        )}
        {visibleTasks.map(task => {
          const isDone = task.status === 'done'
          const projectName = task.projectId
            ? projects.find(p => p.id === task.projectId)?.workItem ?? '—'
            : null

          return (
            <div
              key={task.id}
              onClick={() => { setEditingTask(task); setTaskModalOpen(true) }}
              className={`grid grid-cols-[1.5rem_minmax(0,50%)_6rem_12rem_5.5rem_5.5rem] gap-3 px-10 py-2 cursor-pointer hover:bg-accent transition-colors items-start ${isDone ? 'opacity-50' : ''}`}
            >
              {/* Status cycle button */}
              <button
                onClick={e => cycleTaskStatus(e, task)}
                className="flex items-center justify-center hover:scale-110 transition-transform mt-0.5"
                title={`Mark as ${cycleStatus(task.status).replace('_', ' ')}`}
              >
                <StatusCircle status={task.status} />
              </button>

              {/* Title + notes */}
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight line-clamp-2 ${isDone ? 'line-through' : ''}`}>
                  {task.title}
                </p>
                {task.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-tight mt-0.5">
                    {task.notes}
                  </p>
                )}
              </div>

              {/* Product Area — inherited (read-only) for project tasks;
                  inline editable for non-project tasks */}
              {task.projectId !== null ? (
                (() => {
                  const area = productAreas.find(a => a.id === resolveAreaId(task, projects))
                  return <span className={`text-xs truncate ${isDone ? 'text-muted-foreground' : textClass(area?.color ?? '')}`}>
                    {area?.label ?? '—'}
                  </span>
                })()
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-left truncate hover:underline decoration-dashed underline-offset-2"
                    >
                      {task.productAreaId === null
                        ? <span className="italic font-medium text-foreground">Inbox</span>
                        : (() => {
                            const area = productAreas.find(a => a.id === task.productAreaId)
                            return <span className={isDone ? 'text-muted-foreground' : textClass(area?.color ?? '')}>
                              {area?.label ?? '—'}
                            </span>
                          })()}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start" onClick={e => e.stopPropagation()}>
                    {([{ id: null as number | null, label: 'Inbox (no area)' }, ...productAreas]).map(opt => (
                      <button
                        key={opt.id ?? '__inbox__'}
                        onClick={async () => {
                          try {
                            await updateTask({ id: task.id, productAreaId: opt.id })
                            await load()
                          } catch (err) { handleError(err, 'Failed to update area') }
                        }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent"
                      >
                        <Check className={`h-3 w-3 shrink-0 ${task.productAreaId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                        {opt.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              {/* Project — clickable to navigate to project detail */}
              <span className="text-xs text-muted-foreground break-words">
                {task.projectId ? (
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/projects/${task.projectId}`) }}
                    className="hover:underline hover:text-foreground transition-colors text-left"
                  >
                    {projectName}
                  </button>
                ) : (
                  task.productAreaId === null ? <span className="italic font-medium text-foreground">Inbox</span> : null
                )}
              </span>

              {/* Priority — inline editable */}
              <Popover>
                <PopoverTrigger asChild>
                  <button onClick={e => e.stopPropagation()} className="text-left">
                    {task.priorityId ? (() => {
                      const opt = priorities.find(p => p.id === task.priorityId)
                      return (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${isDone ? 'bg-muted text-muted-foreground border-transparent' : pillClass(opt?.color ?? '')}`}>
                          {!isDone && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(opt?.color ?? '')}`} />}
                          {opt?.label ?? '—'}
                        </span>
                      )
                    })() : (
                      <span className="text-xs text-muted-foreground hover:text-foreground">—</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="start" onClick={e => e.stopPropagation()}>
                  {([{ id: null as number | null, label: '— None', color: '' }, ...priorities]).map(opt => (
                    <button
                      key={opt.id ?? '__none__'}
                      onClick={async () => {
                        try {
                          await updateTask({ id: task.id, priorityId: opt.id })
                          await load()
                        } catch (err) { handleError(err, 'Failed to update priority') }
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent"
                    >
                      <Check className={`h-3 w-3 shrink-0 ${task.priorityId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                      {opt.id !== null && <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                      {opt.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Due date — click to open calendar */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className={`text-xs text-right w-full hover:underline decoration-dashed underline-offset-2 ${
                      isOverdue(task.dueDate) && !isDone ? 'text-red-600 font-medium' :
                      isDueToday(task.dueDate) && !isDone ? 'text-amber-600 font-medium' :
                      'text-muted-foreground'
                    }`}
                  >
                    {task.dueDate ? fmtDate(task.dueDate) : null}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end" onClick={e => e.stopPropagation()}>
                  <Calendar
                    mode="single"
                    selected={task.dueDate ? new Date(task.dueDate + 'T12:00:00') : undefined}
                    onSelect={async (date) => {
                      const iso = date ? date.toISOString().slice(0, 10) : null
                      try {
                        await updateTask({ id: task.id, dueDate: iso })
                        await load()
                      } catch (err) {
                        handleError(err, 'Failed to update due date')
                      }
                    }}
                    initialFocus
                  />
                  {task.dueDate && (
                    <div className="border-t px-3 py-2">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await updateTask({ id: task.id, dueDate: null })
                            await load()
                          } catch (err) {
                            handleError(err, 'Failed to clear due date')
                          }
                        }}
                      >
                        Clear date
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )
        })}
      </div>

      {/* Task modal */}
      <TaskModal
        task={editingTask}
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSaved={() => { load() }}
        projects={projects}
      />
    </div>
  )
}
