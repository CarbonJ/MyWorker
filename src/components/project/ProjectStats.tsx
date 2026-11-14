/**
 * ProjectStats — compact stats panel in the ProjectHeader third column.
 * Shows task health (segmented bar + counts + overdue) and project timeline.
 * No DB queries — derives everything from already-loaded tasks and project data.
 */

import type { Task, Project } from '@/types'
import { localToday } from '@/lib/utils'

interface Props {
  tasks: Task[]
  project: Project
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function relDay(d: number): string {
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ProjectStats({ tasks, project }: Props) {
  const today = localToday()

  const open       = tasks.filter(t => t.status === 'open').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const done       = tasks.filter(t => t.status === 'done').length
  const total      = tasks.length

  const overdue = tasks.filter(
    t => t.status !== 'done' && t.dueDate !== null && t.dueDate < today
  ).length

  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0
  const openPct       = total > 0 ? (open / total) * 100 : 0
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0
  const donePct       = total > 0 ? (done / total) * 100 : 0

  const age     = daysAgo(project.createdAt)
  const updated = daysAgo(project.updatedAt)

  return (
    <div className="space-y-1.5 border rounded-lg p-2.5 text-xs">

      {/* ── Task summary ─────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">Tasks</span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{completionPct}% done</span>
          )}
        </div>

        {/* Segmented bar */}
        <div className="h-1.5 rounded-full overflow-hidden flex bg-muted">
          {total > 0 && (
            <>
              <div className="bg-slate-300 dark:bg-slate-600 h-full" style={{ width: `${openPct}%` }} />
              <div className="bg-blue-400 dark:bg-blue-600 h-full"  style={{ width: `${inProgressPct}%` }} />
              <div className="bg-green-500 dark:bg-green-700 h-full" style={{ width: `${donePct}%` }} />
            </>
          )}
        </div>

        {/* Counts */}
        {total > 0 ? (
          <div className="flex justify-between gap-1 text-muted-foreground">
            <span><span className="font-semibold text-foreground">{open}</span> open</span>
            <span><span className="font-semibold text-blue-500">{inProgress}</span> active</span>
            <span><span className="font-semibold text-green-600 dark:text-green-400">{done}</span> done</span>
          </div>
        ) : (
          <p className="text-muted-foreground italic">No tasks yet</p>
        )}

        {/* Overdue */}
        {overdue > 0 && (
          <p className="text-red-600 dark:text-red-400 font-medium">⚠ {overdue} overdue</p>
        )}
      </div>

      <div className="border-t" />

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Created</span>
          <span className="font-medium text-foreground text-right" title={age <= 0 ? 'Today' : `${age} days old`}>
            {fmtDate(project.createdAt)} <span className="text-muted-foreground font-normal">({age <= 0 ? 'today' : `${age}d`})</span>
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Updated</span>
          <span className="font-medium text-foreground text-right">{relDay(updated)}</span>
        </div>
      </div>

    </div>
  )
}
