import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getProjectById } from '@/db/projects'
import { getOpenTasksByProject } from '@/db/tasks'
import { getWorkLogByProject } from '@/db/workLog'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, Task, WorkLogEntry, DropdownOption } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { TaskModal } from '@/components/TaskModal'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { Button } from '@/components/ui/button'

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

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, ts, wl, pris, areas] = await Promise.all([
        getProjectById(projectId),
        getOpenTasksByProject(projectId),
        getWorkLogByProject(projectId),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      if (!p) { toast.error('Project not found'); navigate('/'); return }
      setProject(p)
      setTasks(ts)
      setWorkLog(wl)
      setPriorities(pris)
      setProductAreas(areas)
    } catch (err) {
      console.error('Failed to load project', err)
      toast.error(`Failed to load project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [projectId, navigate])

  useEffect(() => { load() }, [load])

  const labelFor = (opts: DropdownOption[], optId: number | null) =>
    opts.find(o => o.id === optId)?.label ?? '—'

  const isOverdue = (dueDate: string | null) =>
    dueDate && new Date(dueDate) < new Date(new Date().toDateString())

  const isDueToday = (dueDate: string | null) =>
    dueDate && dueDate === new Date().toISOString().slice(0, 10)

  if (!project) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Loading…
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── TOP PANE: Project Summary ──────────────────────────────────── */}
      <div className="shrink-0 px-6 py-4 border-b bg-background">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground shrink-0">← Projects</button>
              <RagBadge status={project.ragStatus} />
              {project.priorityId && (
                <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                  {labelFor(priorities, project.priorityId)}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold truncate">{project.workItem}</h1>
            {project.workDescription && (
              <p className="text-sm text-muted-foreground">{project.workDescription}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}/edit`)} className="shrink-0">
            Edit
          </Button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
          {project.productAreaId && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Area:</span> {labelFor(productAreas, project.productAreaId)}
            </span>
          )}
          {project.stakeholders && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Stakeholders:</span> {project.stakeholders}
            </span>
          )}
          {project.linkedJiras && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">JIRAs:</span> {project.linkedJiras}
            </span>
          )}
        </div>

        {/* Latest Status */}
        {project.latestStatus && (
          <div className="mt-2 px-3 py-2 bg-muted rounded-md text-sm">
            <span className="font-medium">Status: </span>{project.latestStatus}
          </div>
        )}
      </div>

      {/* ── BOTTOM: Two-column (tasks left, work log right) ───────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── BOTTOM-LEFT: Tasks ──────────────────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col border-r overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="text-sm font-semibold">Tasks</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}
            >
              + Add
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {tasks.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No open tasks.</p>
            )}
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => { setEditingTask(task); setTaskModalOpen(true) }}
                className="px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{task.title}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLASS[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                </div>
                {task.owner && (
                  <p className="text-xs text-muted-foreground mt-0.5">{task.owner}</p>
                )}
                {task.dueDate && (
                  <p className={`text-xs mt-0.5 font-medium ${
                    isOverdue(task.dueDate) ? 'text-red-600' :
                    isDueToday(task.dueDate) ? 'text-amber-600' :
                    'text-muted-foreground'
                  }`}>
                    {isOverdue(task.dueDate) ? '⚠ Overdue: ' : isDueToday(task.dueDate) ? '⏰ Due today: ' : 'Due: '}
                    {task.dueDate}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

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
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
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
