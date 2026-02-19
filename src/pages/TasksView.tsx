import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
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

// ── Shared display constants (mirrors ProjectDetail) ──────────────────────────

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
}

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}

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

function priorityClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function priorityDot(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}

function cycleStatus(current: TaskStatus): TaskStatus {
  if (current === 'open')        return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'open'
}

function StatusCircle({ status }: { status: TaskStatus }) {
  if (status === 'done') return (
    <span className="w-5 h-5 rounded-full bg-green-500 border-2 border-green-500 flex items-center justify-center text-white text-[10px] font-bold leading-none">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-blue-500" />
    </span>
  )
  return <span className="w-5 h-5 rounded-full border-2 border-slate-300" />
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function isOverdue(dueDate: string | null): boolean {
  return !!dueDate && new Date(dueDate) < new Date(new Date().toDateString())
}

function isDueToday(dueDate: string | null): boolean {
  return !!dueDate && dueDate === new Date().toISOString().slice(0, 10)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskSortField = 'project' | 'status' | 'priority' | 'dueDate'
type SortDir = 'asc' | 'desc'

// ── Component ─────────────────────────────────────────────────────────────────

export default function TasksView() {
  const [tasks,        setTasks]        = useState<Task[]>([])
  const [projects,     setProjects]     = useState<Project[]>([])
  const [priorities,   setPriorities]   = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])

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
  const [filterArea,     setFilterArea]     = useState<string>('all')
  const [sortField,      setSortField]      = useState<TaskSortField>('dueDate')
  const [sortDir,        setSortDir]        = useState<SortDir>('asc')

  const load = useCallback(async () => {
    try {
      const [ts, ps, pris, areas] = await Promise.all([
        getAllTasks(),
        getAllProjectsIncludingArchived(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      setTasks(ts)
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
    } catch (err) {
      toast.error(`Failed to load tasks: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const addInboxTask = async () => {
    if (!inboxDraft.trim()) return
    try {
      await createTask({ projectId: null, title: inboxDraft.trim() })
      setInboxDraft('')
      await load()
    } catch (err) {
      toast.error(`Failed to add task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const cycleTaskStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    try {
      await updateTask({ id: task.id, status: cycleStatus(task.status) })
      await load()
    } catch (err) {
      toast.error(`Failed to update task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const toggleSort = (field: TaskSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // ── Derived list ────────────────────────────────────────────────────────────

  const visibleTasks = useMemo(() => {
    let list = [...tasks]

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

    // Product area filter (via the task's project)
    if (filterArea !== 'all') {
      const areaId = Number(filterArea)
      list = list.filter(t => {
        const proj = projects.find(p => p.id === t.projectId)
        return proj?.productAreaId === areaId
      })
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
  }, [tasks, filterStatus, filterPriority, filterProject, filterArea, sortField, sortDir, priorities, projects, productAreas])

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
        <span className="text-xs text-muted-foreground ml-1">
          Inbox tasks can be assigned to a project when you open them.
        </span>
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
                  <span className={`w-1.5 h-1.5 rounded-full ${priorityDot(p.color)}`} />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Project */}
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="inbox">Inbox (unassigned)</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.workItem}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Product Area */}
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="All areas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {productAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Column headers ──────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-[1.5rem_1fr_8rem_6rem_4rem_5.5rem_4.5rem] gap-2 px-6 py-1 text-xs text-muted-foreground border-b">
        <span />
        <span>Title</span>
        <SortBtn field="project" label="Project" />
        <span>Area</span>
        <SortBtn field="priority" label="Priority" />
        <SortBtn field="status" label="Status" />
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
              className={`grid grid-cols-[1.5rem_1fr_8rem_6rem_4rem_5.5rem_4.5rem] gap-2 px-6 py-2 cursor-pointer hover:bg-accent transition-colors items-center ${isDone ? 'opacity-50' : ''}`}
            >
              {/* Status cycle button */}
              <button
                onClick={e => cycleTaskStatus(e, task)}
                className="flex items-center justify-center hover:scale-110 transition-transform"
                title={`Mark as ${cycleStatus(task.status).replace('_', ' ')}`}
              >
                <StatusCircle status={task.status} />
              </button>

              {/* Title + notes */}
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight truncate ${isDone ? 'line-through' : ''}`}>
                  {task.title}
                </p>
                {task.notes && (
                  <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                    {task.notes}
                  </p>
                )}
              </div>

              {/* Project */}
              <span className="text-xs text-muted-foreground truncate">
                {projectName ?? <span className="italic">Inbox</span>}
              </span>

              {/* Product Area — "Inbox" for unassigned tasks, label for project tasks, "—" if project has no area */}
              <span className="text-xs truncate">
                {(() => {
                  if (!task.projectId) return <span className="italic text-muted-foreground/60">Inbox</span>
                  const proj = projects.find(p => p.id === task.projectId)
                  const areaLabel = proj?.productAreaId
                    ? productAreas.find(a => a.id === proj.productAreaId)?.label
                    : undefined
                  return <span className="text-muted-foreground">{areaLabel ?? '—'}</span>
                })()}
              </span>

              {/* Priority */}
              {task.priorityId ? (() => {
                const opt = priorities.find(p => p.id === task.priorityId)
                const lbl = opt?.label ?? '—'
                const color = opt?.color ?? ''
                return (
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${isDone ? 'bg-muted text-muted-foreground border-transparent' : priorityClass(color)}`}>
                    {!isDone && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot(color)}`} />}
                    {lbl}
                  </span>
                )
              })() : (
                <span className="text-xs text-muted-foreground">—</span>
              )}

              {/* Status badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${isDone ? 'bg-muted text-muted-foreground' : STATUS_CLASS[task.status]}`}>
                {STATUS_LABEL[task.status]}
              </span>

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
                    {task.dueDate ? fmtDate(task.dueDate) : '—'}
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
                        toast.error(`Failed to update due date: ${err instanceof Error ? err.message : String(err)}`)
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
                            toast.error(`Failed to clear due date: ${err instanceof Error ? err.message : String(err)}`)
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
