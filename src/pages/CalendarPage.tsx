/**
 * CalendarPage — what's due when, by week or month, with each working day
 * shaded by load (free / light / normal / busy / overloaded) against a normal
 * daily load — see lib/calendarLoad.ts.
 *
 * Shows open / in-progress tasks and active projects that have a due date.
 * With the business-days setting on, only Mon–Fri are shown and weekend due
 * dates appear on the Friday before.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import { getAllTasks } from '@/db/tasks'
import { getAllProjects } from '@/db/projects'
import type { Task, Project } from '@/types'
import { Button } from '@/components/ui/button'
import { TaskModal } from '@/components/TaskModal'
import { localToday, loadUpcomingBusinessDays } from '@/lib/utils'
import {
  addDays, weekDays, monthGridDays, parseLocalDate, displayDate,
  computeBaseline, rateDay, levelRanges, loadNormalLoadSetting, type LoadLevel,
} from '@/lib/calendarLoad'

type View = 'week' | 'month'
const VIEW_KEY = 'myworker:calendar-view'

type DueItem =
  | { kind: 'task'; date: string; task: Task; projectName: string | null }
  | { kind: 'project'; date: string; project: Project }

// Cell shading and badge colour per load level — blue (room to spare) to deep red
const LEVEL_STYLE: Record<LoadLevel, { cell: string; badge: string; swatch: string; label: string }> = {
  free:       { cell: 'bg-sky-100/70 dark:bg-sky-950/60', badge: 'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100', swatch: 'bg-sky-200 dark:bg-sky-900', label: 'Free' },
  light:      { cell: 'bg-sky-50 dark:bg-sky-950/30', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', swatch: 'bg-sky-100 dark:bg-sky-950', label: 'Light' },
  normal:     { cell: '', badge: 'bg-muted text-muted-foreground', swatch: 'bg-muted', label: 'Normal' },
  busy:       { cell: 'bg-orange-50 dark:bg-orange-950/30', badge: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100', swatch: 'bg-orange-200 dark:bg-orange-900', label: 'Busy' },
  overloaded: { cell: 'bg-red-100/70 dark:bg-red-950/60', badge: 'bg-red-600 text-white dark:bg-red-700', swatch: 'bg-red-600 dark:bg-red-700', label: 'Overloaded' },
  unrated:    { cell: '', badge: 'bg-muted text-muted-foreground', swatch: '', label: '' },
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function LoadBadge({ level, count }: { level: LoadLevel; count: number }) {
  if (level === 'unrated' && count === 0) return null
  const style = LEVEL_STYLE[level]
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 tabular-nums ${style.badge}`}
      title={level === 'unrated' ? `${count} due` : `${style.label} — ${count} due`}>
      {count}
    </span>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const today = localToday()
  const businessDays = loadUpcomingBusinessDays()
  const setNormal = loadNormalLoadSetting()

  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week'))
  const [anchor, setAnchor] = useState(today)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const load = useCallback(() => {
    Promise.all([getAllTasks(), getAllProjects()])
      .then(([t, p]) => { setTasks(t); setProjects(p) })
      .catch(err => toast.error(`Failed to load the calendar: ${err instanceof Error ? err.message : String(err)}`))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('myworker:task-saved', load)
    return () => window.removeEventListener('myworker:task-saved', load)
  }, [load])

  const switchView = (v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  // Everything due, grouped by the day it's shown on (weekend dates → Friday in business mode)
  const itemsByDate = useMemo(() => {
    const names = new Map(projects.map(p => [p.id, p.workItem]))
    const map = new Map<string, DueItem[]>()
    const add = (item: DueItem) => {
      const day = displayDate(item.date, businessDays)
      map.set(day, [...(map.get(day) ?? []), item])
    }
    for (const t of tasks) {
      if (t.status === 'done' || !t.dueDate) continue
      // Tasks of archived projects aren't shown anywhere else either
      if (t.projectId !== null && !names.has(t.projectId)) continue
      add({ kind: 'task', date: t.dueDate, task: t, projectName: t.projectId ? names.get(t.projectId) ?? null : null })
    }
    for (const p of projects) if (p.dueDate) add({ kind: 'project', date: p.dueDate, project: p })
    return map
  }, [tasks, projects, businessDays])

  const baseline = useMemo(() => {
    const counts = new Map([...itemsByDate].map(([d, items]) => [d, items.length]))
    return computeBaseline(counts, today, businessDays, setNormal)
  }, [itemsByDate, today, businessDays, setNormal])
  const ranges = useMemo(() => levelRanges(baseline), [baseline])

  const overdueCount = useMemo(
    () => [...itemsByDate.values()].flat().filter(item => item.date < today).length,
    [itemsByDate, today],
  )

  // Visible dates
  const anchorDate = parseLocalDate(anchor)
  const days = view === 'week'
    ? weekDays(anchor, businessDays)
    : monthGridDays(anchorDate.getFullYear(), anchorDate.getMonth(), businessDays)
  const columns = businessDays ? 5 : 7

  const shift = (dir: 1 | -1) => {
    if (view === 'week') { setAnchor(a => addDays(a, 7 * dir)); return }
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1, 12)
    setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }

  const rangeLabel = view === 'week'
    ? `${parseLocalDate(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseLocalDate(days[days.length - 1]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const openItem = (item: DueItem) => {
    if (item.kind === 'project') navigate(`/projects/${item.project.id}`)
    else setEditingTask(item.task)
  }

  const itemChip = (item: DueItem, compact: boolean, shownOn: string) => {
    const overdue = item.date < today
    // Due on a weekend but shown on Friday — say so
    const weekendTag = item.date !== shownOn
      ? <span className="shrink-0 text-[10px] font-medium text-muted-foreground mr-1">{parseLocalDate(item.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
      : null
    const base = 'w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition-colors'
    if (item.kind === 'project') {
      return (
        <button key={`p-${item.project.id}`} type="button" onClick={() => openItem(item)}
          title={`Project due: ${item.project.workItem}`}
          className={`${base} flex items-center gap-1 border border-primary/30 font-medium hover:bg-accent ${overdue ? 'text-red-700 dark:text-red-400' : ''}`}>
          <FolderKanban className="h-3 w-3 shrink-0" />
          {weekendTag}
          <span className="truncate">{item.project.workItem}</span>
        </button>
      )
    }
    const t = item.task
    return (
      <button key={`t-${t.id}`} type="button" onClick={() => openItem(item)}
        title={`${t.title}${item.projectName ? ` — ${item.projectName}` : ''}`}
        className={`${base} block bg-muted/60 hover:bg-accent ${overdue ? 'text-red-700 dark:text-red-400' : ''} ${t.status === 'in_progress' ? 'border-l-2 border-blue-500' : ''}`}>
        <span className="truncate block">{weekendTag}{t.title}</span>
        {!compact && item.projectName && (
          <span className="truncate block text-[10px] text-muted-foreground">{item.projectName}</span>
        )}
      </button>
    )
  }

  const MONTH_LIMIT = 3
  const anchorMonth = anchorDate.getMonth()

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Calendar</h1>
        <div className="flex items-center rounded-md border overflow-hidden">
          {(['week', 'month'] as const).map(v => (
            <button key={v} type="button" onClick={() => switchView(v)}
              className={`h-7 px-2.5 text-xs font-medium border-r last:border-r-0 transition-colors ${view === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shift(-1)} title="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[12rem] text-center">{rangeLabel}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shift(1)} title="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7" onClick={() => setAnchor(today)}>Today</Button>
        {overdueCount > 0 && (
          <span className="text-xs text-red-700 dark:text-red-400">{overdueCount} overdue</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground flex-wrap"
          title={baseline.source === 'set'
            ? 'Normal daily load is set in Settings → Customization.'
            : `Normal = average due per ${businessDays ? 'business day' : 'day'} over the next 8 weeks, with pile-up days capped so one heavy day doesn't skew it. Set a fixed value in Settings → Customization.`}>
          <span>
            Normal {baseline.normal.toFixed(1)} per {businessDays ? 'business day' : 'day'}
            {baseline.source === 'auto' ? ' (auto)' : ' (set)'}
          </span>
          {ranges.map(r => (
            <span key={r.level} className="inline-flex items-center gap-1">
              <span className={`h-3 w-3 rounded-sm border ${LEVEL_STYLE[r.level].swatch}`} />
              {LEVEL_STYLE[r.level].label} {r.label}
            </span>
          ))}
        </div>
      </div>

      {/* Weekday header */}
      <div className="shrink-0 grid border-b text-xs text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {WEEKDAYS.slice(0, columns).map(d => (
          <div key={d} className="px-2 py-1">{d}{businessDays && d === 'Fri' ? ' (+ weekend)' : ''}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoRows: view === 'week' ? 'minmax(100%, auto)' : 'minmax(7rem, 1fr)',
          }}>
          {days.map(day => {
            const items = (itemsByDate.get(day) ?? [])
              .slice()
              .sort((a, b) => (a.kind === 'project' ? 0 : 1) - (b.kind === 'project' ? 0 : 1))
            const level = rateDay(day, items.length, today, businessDays, baseline)
            const d = parseLocalDate(day)
            const outside = view === 'month' && d.getMonth() !== anchorMonth
            const shown = view === 'month' ? items.slice(0, MONTH_LIMIT) : items
            return (
              <div key={day}
                className={`border-r border-b p-1.5 flex flex-col gap-1 min-w-0 ${LEVEL_STYLE[level].cell} ${outside ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-1">
                  <button type="button"
                    onClick={() => { setAnchor(day); switchView('week') }}
                    title="Show this week"
                    className={`text-xs rounded px-1 ${day === today ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                    {view === 'month' ? d.getDate() : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </button>
                  <LoadBadge level={level} count={items.length} />
                </div>
                {shown.map(item => itemChip(item, view === 'month', day))}
                {view === 'month' && items.length > MONTH_LIMIT && (
                  <button type="button" onClick={() => { setAnchor(day); switchView('week') }}
                    className="text-[10px] text-muted-foreground hover:text-foreground text-left px-1.5">
                    +{items.length - MONTH_LIMIT} more
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <TaskModal
        task={editingTask}
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={load}
        projects={projects}
      />
    </div>
  )
}
