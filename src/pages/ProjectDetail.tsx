/**
 * ProjectDetail — coordinator for the project detail view.
 *
 * Owns all data loading and state. Delegates rendering to focused
 * sub-components in src/components/project/:
 *   ProjectHeader — project summary, inline status edit, metadata
 *   TaskPane      — task list with filtering, sorting, status cycling
 *   WorkLogPane   — chronological work log with add-entry form
 *   SplitPane     — resizable two-column layout
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getProjectById, updateProject, archiveProject, restoreProject } from '@/db/projects'
import { getTasksByProject, archiveTasksByProject, restoreTasksByProject } from '@/db/tasks'
import { getWorkLogByProject, addWorkLogEntry } from '@/db/workLog'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getBacklinks } from '@/db/notebook'
import type { Project, Task, WorkLogEntry, DropdownOption, NotebookBacklink } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TaskModal } from '@/components/TaskModal'
import { ProjectModal } from '@/components/ProjectModal'
import { ProjectHeader } from '@/components/project/ProjectHeader'
import { TaskPane, type SortEntry, type TaskSortField } from '@/components/project/TaskPane'
import { WorkLogPane } from '@/components/project/WorkLogPane'
import { SplitPane } from '@/components/project/SplitPane'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const LS_TASK_FILTER_STATUSES = 'myworker:pd-filter-statuses'
const LS_TASK_FILTER_PRIORITIES = 'myworker:pd-filter-priorities'
const LS_TASK_SORTS = 'myworker:pd-task-sorts'

function loadArr(key: string, fallback: string[]): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}

function loadSorts(key: string, fallback: SortEntry[]): SortEntry[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { handleError } = useErrorHandler()
  const projectId = Number(id)

  // ── Data ──────────────────────────────────────────────────────────────────
  const [project,        setProject]        = useState<Project | null>(null)
  const [tasks,          setTasks]          = useState<Task[]>([])
  const [workLog,        setWorkLog]        = useState<WorkLogEntry[]>([])
  const [notebookRefs,   setNotebookRefs]   = useState<NotebookBacklink[]>([])
  const [priorities,     setPriorities]     = useState<DropdownOption[]>([])
  const [productAreas,   setProductAreas]   = useState<DropdownOption[]>([])
  const [projectStatuses,setProjectStatuses]= useState<DropdownOption[]>([])

  // ── Task list state (passed down to TaskPane) ─────────────────────────────
  const [filterStatuses,   setFilterStatuses]   = useState<string[]>(() => loadArr(LS_TASK_FILTER_STATUSES, ['active']))
  const [filterPriorities, setFilterPriorities] = useState<string[]>(() => loadArr(LS_TASK_FILTER_PRIORITIES, []))
  const [sorts,            setSorts]            = useState<SortEntry[]>(() => loadSorts(LS_TASK_SORTS, [{ key: 'dueDate', dir: 'asc' }]))
  const initialFilterSet = useRef(false)

  // Persist filter/sort state
  useEffect(() => { localStorage.setItem(LS_TASK_FILTER_STATUSES,   JSON.stringify(filterStatuses)) },   [filterStatuses])
  useEffect(() => { localStorage.setItem(LS_TASK_FILTER_PRIORITIES, JSON.stringify(filterPriorities)) }, [filterPriorities])
  useEffect(() => { localStorage.setItem(LS_TASK_SORTS, JSON.stringify(sorts)) }, [sorts])

  // ── Edit project modal ────────────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false)

  // ── Task modal ────────────────────────────────────────────────────────────
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask,   setEditingTask]   = useState<Task | null>(null)

  // ── Close-project dialog ──────────────────────────────────────────────────
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closingNote,     setClosingNote]     = useState('')
  const [closing,         setClosing]         = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
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
      // Fetch notebook backlinks after project is known (needs workItem for fallback scan)
      getBacklinks('project', projectId, p.workItem).then(setNotebookRefs).catch(() => {})
      // Default task filter to 'done' for archived projects on first load
      if (!initialFilterSet.current) {
        initialFilterSet.current = true
        if (p.isArchived) setFilterStatuses(['done'])
      }
    } catch (err) {
      handleError(err, 'Failed to load project')
    }
  }, [projectId, navigate])

  useEffect(() => { load() }, [load])

  // Reload when a task is saved via the global modal (Cmd+Shift+T / Command Palette)
  useEffect(() => {
    window.addEventListener('myworker:task-saved', load)
    return () => window.removeEventListener('myworker:task-saved', load)
  }, [load])

  // ── Project actions ───────────────────────────────────────────────────────
  const saveField = useCallback(async (patch: Partial<Omit<Project, 'id'>>) => {
    if (!project) return
    try {
      await updateProject({ id: project.id, ...patch } as Parameters<typeof updateProject>[0])
      await load()
    } catch (err) {
      handleError(err, 'Failed to save')
    }
  }, [project, load])

  const doneOpt = projectStatuses.find(s => s.label.toLowerCase() === 'done')
  const isArchived = project?.isArchived ?? false

  const markComplete = () => {
    if (!project) return
    setClosingNote('')
    setCloseDialogOpen(true)
  }

  const confirmClose = async () => {
    if (!project || !closingNote.trim()) return
    setClosing(true)
    try {
      await addWorkLogEntry(project.id, closingNote.trim())
      await archiveTasksByProject(project.id)
      await archiveProject(project.id)
      if (doneOpt) await updateProject({ id: project.id, statusId: doneOpt.id })
      toast.success('Project closed')
      navigate('/')
    } catch (err) {
      handleError(err, 'Failed to close project')
    } finally {
      setClosing(false)
      setCloseDialogOpen(false)
    }
  }

  const reopenProject = async () => {
    if (!project) return
    try {
      await restoreTasksByProject(project.id)
      await restoreProject(project.id)
      await updateProject({ id: project.id, statusId: null })
      toast.success('Project reopened')
      await load()
    } catch (err) {
      handleError(err, 'Failed to reopen project')
    }
  }

  const toggleSort = (field: TaskSortField) => {
    setSorts(prev => {
      const existing = prev.find(s => s.key === field)
      if (!existing) return [...prev, { key: field, dir: 'asc' }]
      if (existing.dir === 'asc') return prev.map(s => s.key === field ? { ...s, dir: 'desc' as const } : s)
      return prev.filter(s => s.key !== field)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!project) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Loading…
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <ProjectHeader
        project={project}
        priorities={priorities}
        productAreas={productAreas}
        projectStatuses={projectStatuses}
        tasks={tasks}
        isArchived={isArchived}
        onSaveField={saveField}
        onMarkComplete={markComplete}
        onReopen={reopenProject}
        onEdit={() => setEditModalOpen(true)}
      />

      <SplitPane
        left={
          <TaskPane
            tasks={tasks}
            priorities={priorities}
            filterStatuses={filterStatuses}
            filterPriorities={filterPriorities}
            sorts={sorts}
            onFilterStatuses={setFilterStatuses}
            onFilterPriorities={setFilterPriorities}
            onToggleSort={toggleSort}
            onAddTask={() => { setEditingTask(null); setTaskModalOpen(true) }}
            onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
            onReload={load}
          />
        }
        right={
          <WorkLogPane
            projectId={projectId}
            projectName={project?.workItem}
            workLog={workLog}
            notebookRefs={notebookRefs}
            onSaved={load}
          />
        }
      />

      <ProjectModal
        project={project}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={() => { setEditModalOpen(false); load() }}
      />

      <TaskModal
        projectId={projectId}
        task={editingTask}
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        onSaved={load}
      />

      {/* ── Close Project dialog ─────────────────────────────────────────── */}
      <Dialog open={closeDialogOpen} onOpenChange={v => { if (!v) setCloseDialogOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Close Project</DialogTitle>
            <DialogDescription>
              Write a closing summary before archiving <span className="font-medium text-foreground">"{project.workItem}"</span>. This will be saved as the final work log entry.
            </DialogDescription>
          </DialogHeader>

          <textarea
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder="Summarise what was delivered, any outcomes, lessons learned, or handoff notes…"
            value={closingNote}
            onChange={e => setClosingNote(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') confirmClose()
            }}
          />

          <DialogFooter>
            <p className="text-xs text-muted-foreground mr-auto">⌘/Ctrl+↵ to close project</p>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmClose}
              disabled={!closingNote.trim() || closing}
              className="text-green-700 border-green-300 bg-green-50 hover:bg-green-100 hover:text-green-800"
              variant="outline"
            >
              {closing ? 'Closing…' : '✓ Close Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
