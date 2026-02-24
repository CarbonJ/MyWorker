/**
 * TaskPane — bottom-left pane of ProjectDetail.
 *
 * Displays the filtered, sorted task list for a project. Handles
 * inline status cycling and due-date editing via a calendar popover.
 */

import { useMemo } from 'react'
import type { Task, TaskStatus, DropdownOption } from '@/types'
import { updateTask } from '@/db/tasks'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Check } from 'lucide-react'
import { pillClass, dotClass } from '@/lib/colors'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'
import { useErrorHandler } from '@/hooks/useErrorHandler'


type TaskSortField = 'status' | 'priority' | 'dueDate'
type SortDir = 'asc' | 'desc'

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
  filterStatus: string
  filterPriority: string
  sortField: TaskSortField
  sortDir: SortDir
  onFilterStatus: (v: string) => void
  onFilterPriority: (v: string) => void
  onToggleSort: (field: TaskSortField) => void
  onAddTask: () => void
  onEditTask: (task: Task) => void
  onReload: () => void
}

export function TaskPane({
  tasks, priorities,
  filterStatus, filterPriority, sortField, sortDir,
  onFilterStatus, onFilterPriority, onToggleSort,
  onAddTask, onEditTask, onReload,
}: Props) {
  const { handleError } = useErrorHandler()

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

  const handleCycleStatus = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation()
    try {
      await updateTask({ id: task.id, status: cycleStatus(task.status) })
      onReload()
    } catch (err) {
      handleError(err, 'Failed to update task')
    }
  }

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
          <Select value={filterStatus} onValueChange={onFilterStatus}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={onFilterPriority}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="All priorities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="none">No priority</SelectItem>
              {priorities.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1.5rem_1fr_4rem_4.5rem] gap-2 px-4 pb-1 text-xs text-muted-foreground">
          <span />
          <span>Title</span>
          <button onClick={() => onToggleSort('priority')} className="hover:text-foreground tabular-nums text-left">
            Priority{sortField === 'priority' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
          <button onClick={() => onToggleSort('dueDate')} className="hover:text-foreground tabular-nums text-right">
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
              onClick={() => onEditTask(task)}
              className={`grid grid-cols-[1.5rem_1fr_4rem_4.5rem] gap-2 px-4 py-2 cursor-pointer hover:bg-accent transition-colors items-center ${isDone ? 'opacity-50' : ''}`}
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
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${isDone ? 'bg-muted text-muted-foreground border-transparent' : pillClass(opt?.color ?? '')}`}>
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
                      try {
                        await updateTask({ id: task.id, dueDate: date ? date.toISOString().slice(0, 10) : null })
                        onReload()
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
                            onReload()
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
    </div>
  )
}
