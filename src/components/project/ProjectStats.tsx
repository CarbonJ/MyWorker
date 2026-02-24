/**
 * ProjectStats — compact stats panel in the ProjectHeader third column.
 * Shows task health (segmented bar + counts + overdue) and project timeline.
 * No DB queries — derives everything from already-loaded tasks and project data.
 */

import type { Task, Project } from '@/types'

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
  const today = new Date().toISOString().slice(0, 10)

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
    <div className="space-y-3 border rounded-lg p-3 text-sm">

      {/* ── Task summary ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">Tasks</span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{completionPct}% done</span>
          )}
        </div>

        {/* Segmented bar */}
        <div className="h-2 rounded-full overflow-hidden flex bg-muted">
          {total > 0 && (
            <>
              <div className="bg-slate-300 h-full" style={{ width: `${openPct}%` }} />
              <div className="bg-blue-400 h-full"  style={{ width: `${inProgressPct}%` }} />
              <div className="bg-green-500 h-full" style={{ width: `${donePct}%` }} />
            </>
          )}
        </div>

        {/* Counts */}
        {total > 0 ? (
          <div className="grid grid-cols-3 gap-1 text-xs text-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-foreground">{open}</span>
              <span className="text-muted-foreground leading-none">Open</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-blue-500">{inProgress}</span>
              <span className="text-muted-foreground leading-none">Active</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-green-600">{done}</span>
              <span className="text-muted-foreground leading-none">Done</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No tasks yet</p>
        )}

        {/* Overdue */}
        {overdue > 0 && (
          <p className="text-xs text-red-600 font-medium">⚠ {overdue} overdue</p>
        )}
      </div>

      <div className="border-t" />

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Created</span>
          <span className="font-medium text-foreground text-right">{fmtDate(project.createdAt)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Age</span>
          <span className="font-medium text-foreground text-right">{age <= 0 ? 'Today' : `${age} days`}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Updated</span>
          <span className="font-medium text-foreground text-right">{relDay(updated)}</span>
        </div>
      </div>

    </div>
  )
}
