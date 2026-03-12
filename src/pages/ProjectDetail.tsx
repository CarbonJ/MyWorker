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
import { getProjectById, updateProject } from '@/db/projects'
import { getTasksByProject, archiveTasksByProject, restoreTasksByProject } from '@/db/tasks'
import { getWorkLogByProject } from '@/db/workLog'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, Task, WorkLogEntry, DropdownOption } from '@/types'
import { TaskModal } from '@/components/TaskModal'
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

  // ── Task modal ────────────────────────────────────────────────────────────
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask,   setEditingTask]   = useState<Task | null>(null)

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
      // Default task filter to 'done' for archived projects on first load
      if (!initialFilterSet.current) {
        initialFilterSet.current = true
        const doneOpt = statuses.find(s => s.label.toLowerCase() === 'done')
        if (doneOpt && p.statusId === doneOpt.id) setFilterStatuses(['done'])
      }
    } catch (err) {
      handleError(err, 'Failed to load project')
    }
  }, [projectId, navigate])

  useEffect(() => { load() }, [load])

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
  const isArchived = !!(project && doneOpt && project.statusId === doneOpt.id)

  const markComplete = async () => {
    if (!project || !doneOpt) { toast.error('No "Done" status configured in Settings'); return }
    try {
      await archiveTasksByProject(project.id)
      await updateProject({ id: project.id, statusId: doneOpt.id })
      toast.success('Project archived')
      navigate('/')
    } catch (err) {
      handleError(err, 'Failed to archive project')
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
        projectId={projectId}
        priorities={priorities}
        productAreas={productAreas}
        projectStatuses={projectStatuses}
        tasks={tasks}
        isArchived={isArchived}
        onSaveField={saveField}
        onMarkComplete={markComplete}
        onReopen={reopenProject}
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
            workLog={workLog}
            onSaved={load}
          />
        }
      />

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
