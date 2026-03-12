/**
 * TaskPane — bottom-left pane of ProjectDetail.
 *
 * Displays the filtered, sorted task list for a project. Handles
 * inline status cycling and due-date editing via a calendar popover.
 */

import { useMemo, useState } from 'react'
import type { Task, TaskStatus, DropdownOption } from '@/types'
import { updateTask } from '@/db/tasks'
import { addWorkLogEntry } from '@/db/workLog'
import { Button } from '@/components/ui/button'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Check, RefreshCw } from 'lucide-react'
import { pillClass, dotClass } from '@/lib/colors'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { RecurringCompleteDialog } from '@/components/RecurringCompleteDialog'


export type TaskSortField = 'status' | 'priority' | 'dueDate'
type SortDir = 'asc' | 'desc'
export type SortEntry = { key: TaskSortField; dir: SortDir }

function cycleStatus(current: TaskStatus): TaskStatus {
  if (current === 'open')        return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'open'
}

function StatusCircle({ status }: { status: TaskStatus }) {
  if (status === 'done') return (
    <span className="w-5 h-5 rounded bg-green-500 border-2 border-green-500 flex items-center justify-center text-white text-[10px] font-bold leading-none">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-5 h-5 rounded border-2 border-blue-500 flex items-center justify-center">
      <span className="w-2 h-2 rounded-sm bg-blue-500" />
    </span>
  )
  return <span className="w-5 h-5 rounded border-2 border-slate-300" />
}

interface Props {
  tasks: Task[]
  priorities: DropdownOption[]
  filterStatuses: string[]
  filterPriorities: string[]
  sorts: SortEntry[]
  onFilterStatuses: (v: string[]) => void
  onFilterPriorities: (v: string[]) => void
  onToggleSort: (field: TaskSortField) => void
  onAddTask: () => void
  onEditTask: (task: Task) => void
  onReload: () => void
}

export function TaskPane({
  tasks, priorities,
  filterStatuses, filterPriorities, sorts,
  onFilterStatuses, onFilterPriorities, onToggleSort,
  onAddTask, onEditTask, onReload,
}: Props) {
  const { handleError } = useErrorHandler()
  const [recurringTask, setRecurringTask] = useState<Task | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const visibleTasks = useMemo(() => {
    let list = [...tasks]

    // Status filter — when empty = All
    if (filterStatuses.length > 0) {
      list = list.filter(t => {
        // Special 'active' pseudo-status
        if (filterStatuses.includes('active')) {
          const isActive = t.status !== 'done' || t.updatedAt.slice(0, 10) === today
          if (isActive) return true
        }
        // Literal status values
        const literalStatuses = filterStatuses.filter(s => s !== 'active')
        if (literalStatuses.length > 0 && literalStatuses.includes(t.status)) return true
        return false
      })
    }

    // Priority filter — 'none' means no priority set
    if (filterPriorities.length > 0) {
      list = list.filter(t => {
        if (filterPriorities.includes('none') && t.priorityId === null) return true
        if (t.priorityId !== null && filterPriorities.includes(String(t.priorityId))) return true
        return false
      })
    }

    // Multi-sort: apply in order
    list.sort((a, b) => {
      for (const { key, dir } of sorts) {
        let cmp = 0
        if (key === 'status') {
          const order: Record<string, number> = { open: 0, in_progress: 1, done: 2 }
          cmp = order[a.status] - order[b.status]
        } else if (key === 'priority') {
          const ai = priorities.findIndex(p => p.id === a.priorityId)
          const bi = priorities.findIndex(p => p.id === b.priorityId)
          cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        } else {
          const ad = a.dueDate ?? '9999-99-99'
          const bd = b.dueDate ?? '9999-99-99'
          cmp = ad < bd ? -1 : ad > bd ? 1 : 0
        }
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
    return list
  }, [tasks, filterStatuses, filterPriorities, sorts, priorities, today])

  const handleCycleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    // Intercept in_progress → done for recurring tasks: show reschedule dialog
    if (task.status === 'in_progress' && task.isRecurring) {
      setRecurringTask(task)
      return
    }
    try {
      const newStatus = cycleStatus(task.status)
      await updateTask({ id: task.id, status: newStatus })
      if (newStatus === 'done' && task.projectId) {
        await addWorkLogEntry(task.projectId, `✓ Completed: ${task.title}`)
      }
      onReload()
    } catch (err) {
      handleError(err, 'Failed to update task')
    }
  }

  const handleReschedule = async (newDueDate: string, note: string) => {
    if (!recurringTask) return
    try {
      await updateTask({ id: recurringTask.id, status: 'open', dueDate: newDueDate })
      if (recurringTask.projectId) {
        const logNote = `✓ Completed: ${recurringTask.title}. Next due: ${fmtDate(newDueDate)}${note ? `. ${note}` : ''}`
        await addWorkLogEntry(recurringTask.projectId, logNote)
      }
      onReload()
    } catch (err) {
      handleError(err, 'Failed to reschedule task')
    } finally {
      setRecurringTask(null)
    }
  }

  const handleMarkDonePermanently = async () => {
    if (!recurringTask) return
    try {
      await updateTask({ id: recurringTask.id, status: 'done', isRecurring: false })
      onReload()
    } catch (err) {
      handleError(err, 'Failed to update task')
    } finally {
      setRecurringTask(null)
    }
  }

  // Sort indicator for column headers
  const SortInd = ({ field }: { field: TaskSortField }) => {
    const idx = sorts.findIndex(s => s.key === field)
    if (idx === -1) return null
    return (
      <span className="ml-1 opacity-60 text-[10px]">
        {sorts.length > 1 ? idx + 1 : ''}{sorts[idx].dir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'open',   label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done',   label: 'Done' },
  ]
  const priorityOptions = [
    { value: 'none', label: 'No priority' },
    ...priorities.map(p => ({
      value: String(p.id),
      label: p.label,
      prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(p.color)}`} />,
    })),
  ]

  return (
    <div className="flex flex-col overflow-hidden min-w-0 h-full">
      {/* Header + filters + column labels */}
      <div className="shrink-0 border-b">
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-sm font-semibold">Tasks</h2>
          <Button size="sm" variant="secondary" onClick={onAddTask}>
            + Add Task
          </Button>
        </div>
        <div className="flex items-center gap-2 px-4 pb-2">
          <MultiSelectFilter
            options={statusOptions}
            value={filterStatuses}
            onChange={onFilterStatuses}
            placeholder="Status"
            width="w-32"
          />
          <MultiSelectFilter
            options={priorityOptions}
            value={filterPriorities}
            onChange={onFilterPriorities}
            placeholder="All priorities"
            width="w-32"
          />
        </div>
        <div className="grid grid-cols-[1.5rem_1fr_auto_4.5rem] gap-2 px-4 pb-1 text-xs text-muted-foreground">
          <span />
          <span>Title</span>
          <button onClick={() => onToggleSort('priority')} className="hover:text-foreground tabular-nums text-left">
            Priority<SortInd field="priority" />
          </button>
          <button onClick={() => onToggleSort('dueDate')} className="hover:text-foreground tabular-nums text-right">
            Due<SortInd field="dueDate" />
          </button>
        </div>
      </div>

      {/* Task rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
        {visibleTasks.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No tasks.</p>
        )}
        {visibleTasks.map(task => {
          const isDone = task.status === 'done'
          const completedToday = isDone && task.updatedAt.slice(0, 10) === today
          return (
            <div
              key={task.id}
              onClick={() => onEditTask(task)}
              className={`grid grid-cols-[1.5rem_1fr_auto_4.5rem] gap-2 px-4 py-2 cursor-pointer hover:bg-accent transition-colors items-center ${isDone && !completedToday ? 'opacity-50' : ''}`}
            >
              <button
                onClick={e => handleCycleStatus(e, task)}
                className="flex items-center justify-center hover:scale-110 transition-transform"
                title={`Mark as ${cycleStatus(task.status).replace('_', ' ')}`}
              >
                <StatusCircle status={task.status} />
              </button>
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight truncate ${isDone ? 'line-through' : ''}`}>
                  {task.title}
                </p>
                {task.notes && (
                  <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{task.notes}</p>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button onClick={e => e.stopPropagation()} className="text-left">
                    {task.priorityId ? (() => {
                      const opt = priorities.find(p => p.id === task.priorityId)
                      return (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border whitespace-nowrap ${isDone ? 'bg-muted text-muted-foreground border-transparent' : pillClass(opt?.color ?? '')}`}>
                          {!isDone && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(opt?.color ?? '')}`} />}
                          {opt?.label ?? '—'}
                        </span>
                      )
                    })() : <span className="text-xs text-muted-foreground">—</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-1" align="start" onClick={e => e.stopPropagation()}>
                  {([{ id: null as number | null, label: '— None', color: '' }, ...priorities]).map(opt => (
                    <button
                      key={opt.id ?? '__none__'}
                      onClick={async () => {
                        try {
                          await updateTask({ id: task.id, priorityId: opt.id })
                          onReload()
                        } catch (err) { handleError(err, 'Failed to update priority') }
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent"
                    >
                      <Check className={`h-3 w-3 shrink-0 ${task.priorityId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                      {opt.id && <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                      {opt.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className={`text-xs text-right w-full hover:underline decoration-dashed underline-offset-2 flex items-center justify-end gap-1 ${
                      isOverdue(task.dueDate) && !isDone ? 'text-red-600 font-medium' :
                      isDueToday(task.dueDate) && !isDone ? 'text-amber-600 font-medium' :
                      'text-muted-foreground'
                    }`}
                  >
                    {task.isRecurring && <RefreshCw className="w-2.5 h-2.5 shrink-0 opacity-60" />}
                    {task.dueDate ? fmtDate(task.dueDate) : '—'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end" onClick={e => e.stopPropagation()}>
                  <Calendar
                    mode="single"
                    selected={task.dueDate ? new Date(task.dueDate + 'T12:00:00') : undefined}
                    onSelect={async (date) => {
                      try {
                        await updateTask({ id: task.id, dueDate: date ? date.toISOString().slice(0, 10) : null })
                        onReload()
                      } catch (err) {
                        handleError(err, 'Failed to update due date')
                      }
                    }}
                    initialFocus
                  />
                  <div className="border-t px-3 py-2 flex gap-2">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await updateTask({ id: task.id, dueDate: new Date().toISOString().slice(0, 10) })
                          onReload()
                        } catch (err) {
                          handleError(err, 'Failed to set due date')
                        }
                      }}
                    >
                      Today
                    </button>
                    {task.dueDate && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await updateTask({ id: task.id, dueDate: null })
                            onReload()
                          } catch (err) {
                            handleError(err, 'Failed to clear due date')
                          }
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )
        })}
      </div>

      {/* Recurring task completion dialog */}
      {recurringTask && (
        <RecurringCompleteDialog
          task={recurringTask}
          open={!!recurringTask}
          onReschedule={handleReschedule}
          onMarkDone={handleMarkDonePermanently}
          onCancel={() => setRecurringTask(null)}
        />
      )}
    </div>
  )
}
