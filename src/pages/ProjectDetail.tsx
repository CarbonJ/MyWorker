import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getProjectById, updateProject } from '@/db/projects'
import { getTasksByProject, updateTask, archiveTasksByProject, restoreTasksByProject } from '@/db/tasks'
import { getWorkLogByProject } from '@/db/workLog'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, Task, TaskStatus, WorkLogEntry, DropdownOption } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { TaskModal } from '@/components/TaskModal'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'


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

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* invalid URL */ }
  return null
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

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<DropdownOption[]>([])
  const [descExpanded, setDescExpanded] = useState(false)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // Resizable split
  const [splitPct, setSplitPct] = useState(60)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
  }
  const onDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !splitContainerRef.current) return
    const { left, width } = splitContainerRef.current.getBoundingClientRect()
    const pct = ((e.clientX - left) / width) * 100
    setSplitPct(Math.min(80, Math.max(20, pct)))
  }
  const onDividerPointerUp = () => { dragging.current = false }

  // Task sort/filter state
  type TaskSortField = 'status' | 'priority' | 'dueDate'
  type SortDir = 'asc' | 'desc'
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [sortField, setSortField] = useState<TaskSortField>('dueDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const initialFilterSet = useRef(false)

  // Inline edit state
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState('')
  const statusInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [p, ts, wl, pris, areas, statuses] = await Promise.all([
        getProjectById(projectId),
        getTasksByProject(projectId),
        getWorkLogByProject(projectId),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
      ])
      if (!p) { toast.error('Project not found'); navigate('/'); return }
      setProject(p)
      setTasks(ts)
      setWorkLog(wl)
      setPriorities(pris)
      setProductAreas(areas)
      setProjectStatuses(statuses)
      // On first load, default task filter to 'done' for archived projects
      // so all auto-completed tasks are visible rather than hidden.
      if (!initialFilterSet.current) {
        initialFilterSet.current = true
        const doneStatusOpt = statuses.find(s => s.label.toLowerCase() === 'done')
        if (doneStatusOpt && p.statusId === doneStatusOpt.id) {
          setFilterStatus('done')
        }
      }
    } catch (err) {
      console.error('Failed to load project', err)
      toast.error(`Failed to load project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [projectId, navigate])

  useEffect(() => { load() }, [load])

  const saveField = useCallback(async (patch: Omit<Parameters<typeof updateProject>[0], 'id'>) => {
    if (!project) return
    try {
      await updateProject({ id: project.id, ...patch })
      await load()
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [project, load])

  const openStatusEdit = () => {
    if (!project) return
    setStatusDraft(project.latestStatus)
    setEditingStatus(true)
    setTimeout(() => statusInputRef.current?.focus(), 0)
  }

  const commitStatus = () => {
    setEditingStatus(false)
    if (project && statusDraft !== project.latestStatus) {
      saveField({ latestStatus: statusDraft })
    }
  }

  const doneOpt = projectStatuses.find(s => s.label.toLowerCase() === 'done')
  const isArchived = !!(project && doneOpt && project.statusId === doneOpt.id)

  const markComplete = async () => {
    if (!project || !doneOpt) { toast.error('No "Done" status configured in Settings'); return }
    try {
      await archiveTasksByProject(project.id)
      await updateProject({ id: project.id, statusId: doneOpt.id })
      toast.success('Project archived')
      navigate('/')
    } catch (err) {
      toast.error(`Failed to archive: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const reopenProject = async () => {
    if (!project) return
    try {
      await restoreTasksByProject(project.id)
      await updateProject({ id: project.id, statusId: null })
      toast.success('Project reopened')
      await load()
    } catch (err) {
      toast.error(`Failed to reopen: ${err instanceof Error ? err.message : String(err)}`)
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

  const labelFor = (opts: DropdownOption[], optId: number | null) =>
    opts.find(o => o.id === optId)?.label ?? '—'

  const isOverdue = (dueDate: string | null) =>
    dueDate && new Date(dueDate) < new Date(new Date().toDateString())

  const isDueToday = (dueDate: string | null) =>
    dueDate && dueDate === new Date().toISOString().slice(0, 10)

  // Format ISO date (YYYY-MM-DD) → MM/DD/YY for display; sorting still uses ISO
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y.slice(2)}`
  }

  const toggleSort = (field: TaskSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const visibleTasks = useMemo(() => {
    let list = [...tasks]
    if (filterStatus === 'active') list = list.filter(t => t.status !== 'done')
    else if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus)
    if (filterPriority !== 'all') {
      const pid = filterPriority === 'none' ? null : Number(filterPriority)
      list = list.filter(t => t.priorityId === pid)
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'status') {
        const order: Record<string, number> = { open: 0, in_progress: 1, done: 2 }
        cmp = order[a.status] - order[b.status]
      } else if (sortField === 'priority') {
        const ai = priorities.findIndex(p => p.id === a.priorityId)
        const bi = priorities.findIndex(p => p.id === b.priorityId)
        cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      } else {
        const ad = a.dueDate ?? '9999-99-99'
        const bd = b.dueDate ?? '9999-99-99'
        cmp = ad < bd ? -1 : ad > bd ? 1 : 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [tasks, filterStatus, filterPriority, sortField, sortDir, priorities])

  if (!project) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Loading…
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── TOP PANE: Project Summary ──────────────────────────────────── */}
      <div className="shrink-0 px-6 py-4 border-b bg-background">
        {/* Back link — full width above both columns */}
        <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground mb-3 block">
          ← Projects
        </button>

        {/* Two-column grid */}
        <div className="grid grid-cols-2 gap-6">

          {/* LEFT: Work Item + Description */}
          <div className="min-w-0 space-y-2 border rounded-lg p-3">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{project.workItem}</h1>
              <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}/edit`)} className="shrink-0">
                Edit
              </Button>
              {isArchived ? (
                <Button size="sm" variant="outline" onClick={reopenProject} className="shrink-0 text-green-700 border-green-300 hover:bg-green-50">
                  ↩ Reopen
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={markComplete} className="shrink-0 text-slate-600 hover:text-green-700 hover:border-green-300">
                  ✓ Mark Complete
                </Button>
              )}
            </div>
            {project.workDescription && (
              <div>
                <div className={descExpanded ? undefined : 'line-clamp-3'}>
                  <MarkdownContent className="text-sm text-muted-foreground">{project.workDescription}</MarkdownContent>
                </div>
                {(project.workDescription.length > 200 || project.workDescription.split('\n').length > 3) && (
                  <button
                    onClick={() => setDescExpanded(v => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground mt-0.5"
                  >
                    {descExpanded ? 'Show less ↑' : 'Show more ↓'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Metadata */}
          <div className="space-y-3 text-sm border rounded-lg p-3">
            {/* Latest Status — click to edit inline */}
            <div
              className="px-3 py-2 bg-muted rounded-md cursor-text"
              onClick={() => !editingStatus && openStatusEdit()}
            >
              <span className="font-medium">Status: </span>
              {editingStatus ? (
                <Input
                  ref={statusInputRef}
                  value={statusDraft}
                  onChange={e => setStatusDraft(e.target.value)}
                  onBlur={commitStatus}
                  onKeyDown={e => { if (e.key === 'Enter') commitStatus(); if (e.key === 'Escape') setEditingStatus(false) }}
                  className="h-6 px-1 py-0 text-sm border-0 shadow-none bg-transparent focus-visible:ring-0 inline-block w-full"
                />
              ) : (
                <span className="text-muted-foreground">{project.latestStatus || <span className="italic text-muted-foreground/60">click to add…</span>}</span>
              )}
            </div>
            {/* RAG + Priority + Area + Project Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <RagBadge status={project.ragStatus} />
              {project.priorityId && (
                <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                  {labelFor(priorities, project.priorityId)}
                </span>
              )}
              {project.statusId && (() => {
                const opt = projectStatuses.find(s => s.id === project.statusId)
                if (!opt) return null
                return (
                  <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${priorityClass(opt.color)}`}>
                    {opt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot(opt.color)}`} />}
                    {opt.label}
                  </span>
                )
              })()}
              {project.productAreaId && (
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">Area:</span> {labelFor(productAreas, project.productAreaId)}
                </span>
              )}
            </div>
            {project.stakeholders.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="font-medium text-foreground text-sm">Stakeholders:</span>
                {project.stakeholders.map((s, i) => (
                  <span key={i} className="bg-white border rounded-full px-2.5 py-0.5 text-xs text-foreground shadow-sm">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
            {project.linkedJiras.length > 0 && (
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">JIRAs: </span>
                <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
                  {project.linkedJiras.map((jira, i) => {
                    const href = safeUrl(jira.url)
                    return href ? (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                      >
                        {jira.label || jira.url}
                      </a>
                    ) : (
                      <span key={i} className="text-muted-foreground text-xs" title="Invalid URL">
                        {jira.label || jira.url}
                      </span>
                    )
                  })}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── BOTTOM: Two-column (tasks left, work log right) ───────────── */}
      <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">

        {/* ── BOTTOM-LEFT: Tasks ──────────────────────────────────────── */}
        <div style={{ width: `${splitPct}%` }} className="flex flex-col overflow-hidden min-w-0">

          {/* Header + filters + column labels */}
          <div className="shrink-0 border-b">
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-sm font-semibold">Tasks</h2>
              <Button size="sm" variant="outline"
                onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}>
                + Add
              </Button>
            </div>
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 pb-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="none">No priority</SelectItem>
                  {priorities.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-[1.5rem_1fr_4rem_5.5rem_4.5rem] gap-2 px-4 pb-1 text-xs text-muted-foreground">
              <span />
              <span>Title</span>
              <button onClick={() => toggleSort('priority')} className="hover:text-foreground tabular-nums text-left">
                Priority{sortField === 'priority' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button onClick={() => toggleSort('status')} className="hover:text-foreground tabular-nums text-left">
                Status{sortField === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
              <button onClick={() => toggleSort('dueDate')} className="hover:text-foreground tabular-nums text-right">
                Due{sortField === 'dueDate' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </div>
          </div>

          {/* Task rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {visibleTasks.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No tasks.</p>
            )}
            {visibleTasks.map(task => {
              const isDone = task.status === 'done'
              return (
                <div
                  key={task.id}
                  onClick={() => { setEditingTask(task); setTaskModalOpen(true) }}
                  className={`grid grid-cols-[1.5rem_1fr_4rem_5.5rem_4.5rem] gap-2 px-4 py-2 cursor-pointer hover:bg-accent transition-colors items-center ${isDone ? 'opacity-50' : ''}`}
                >
                  {/* Quick status cycle */}
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
        </div>

        {/* ── DRAG DIVIDER ────────────────────────────────────────────── */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
        />

        {/* ── RIGHT: Work Log ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="text-sm font-semibold">Work Log</h2>
            <span className="text-xs text-muted-foreground">{workLog.length} entries</span>
          </div>

          {/* Add entry form */}
          <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
            <WorkLogEntryForm projectId={projectId} onSaved={load} />
          </div>

          {/* Log entries — newest first */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {workLog.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries yet.</p>
            )}
            {workLog.map(entry => (
              <div key={entry.id} className="px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">
                  {new Date(entry.createdAt + 'Z').toLocaleString()}
                </p>
                <MarkdownContent>{entry.note}</MarkdownContent>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task modal */}
      <TaskModal
        projectId={projectId}
        task={editingTask}
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSaved={load}
      />
    </div>
  )
}
