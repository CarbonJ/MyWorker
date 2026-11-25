/**
 * CalendarPage — what's due when, by week or month, with each working day
 * shaded by load (free / light / normal / busy / overloaded) against a normal
 * daily load — see lib/calendarLoad.ts.
 *
 * Shows open / in-progress tasks and active projects that have a due date.
 * With the business-days setting on, only Mon–Fri are shown and weekend due
 * dates appear on the Friday before.
 */

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ENTITY_ICONS, SCREEN_ICONS } from '@/lib/icons'
import { toast } from 'sonner'
import { getAllTasks } from '@/db/tasks'
import { getAllProjects } from '@/db/projects'
import type { Task, Project } from '@/types'
import { Button } from '@/components/ui/button'
import { TaskModal } from '@/components/TaskModal'
import { localToday, loadUpcomingBusinessDays } from '@/lib/utils'
import {
  addDays, addMonths, weekDays, weeksBetweenMonths, parseLocalDate, displayDate,
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

// The month view is one continuous run of weeks. It starts this many months
// either side of today and grows by EXTEND_MONTHS whenever a scroll gets
// within EDGE_PX of either end.
const INITIAL_BEFORE = 6
const INITIAL_AFTER = 12
const EXTEND_MONTHS = 6
const EDGE_PX = 400
const MIN_ROW_PX = 112

function monthLabel(ym: string): string {
  return parseLocalDate(`${ym}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

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
  // Month view: the months rendered, and the month currently at the top of the scroll
  const [range, setRange] = useState(() => ({ from: addMonths(today, -INITIAL_BEFORE), to: addMonths(today, INITIAL_AFTER) }))
  const [visibleMonth, setVisibleMonth] = useState(() => addMonths(today, 0))
  const [rowPx, setRowPx] = useState(MIN_ROW_PX)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  // A month to scroll to once it has rendered, and how
  const pendingScroll = useRef<{ month: string; smooth: boolean } | null>(null)
  // Height before months were added above, so the view can stay where it was
  const heightBeforePrepend = useRef<number | null>(null)
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

  // Week view dates
  const days = weekDays(anchor, businessDays)
  const columns = businessDays ? 5 : 7

  // Month view rows: whole weeks across the rendered months
  const weeks = useMemo(() => weeksBetweenMonths(range.from, range.to, businessDays), [range, businessDays])
  rowRefs.current.length = weeks.length

  // The row holding the first shown day of a month (the 1st, or the Monday after in business mode)
  const rowOfMonth = useCallback((ym: string) => weeks.findIndex(w => w[w.length - 1] >= `${ym}-01`), [weeks])

  const scrollToMonth = useCallback((ym: string, smooth: boolean) => {
    if (ym < range.from || ym > range.to) {
      // Render it first; the layout effect below scrolls once it exists
      pendingScroll.current = { month: ym, smooth: false }
      setRange(r => ({ from: ym < r.from ? addMonths(`${ym}-01`, -2) : r.from, to: ym > r.to ? addMonths(`${ym}-01`, 2) : r.to }))
      return
    }
    const row = rowRefs.current[rowOfMonth(ym)]
    if (row && scrollRef.current) scrollRef.current.scrollTo({ top: row.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
    setVisibleMonth(ym)
  }, [range, rowOfMonth])

  // Opening the month view shows the anchor's month (scrolled to by the effect below).
  // Declared first so it runs first. Only on switching view, not on every anchor change.
  useLayoutEffect(() => {
    if (view === 'month') pendingScroll.current = { month: addMonths(anchor, 0), smooth: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // After rendering: keep the view steady when months were added above, and run any pending scroll
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || view !== 'month') return
    if (heightBeforePrepend.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforePrepend.current
      heightBeforePrepend.current = null
    }
    if (pendingScroll.current) {
      const { month, smooth } = pendingScroll.current
      pendingScroll.current = null
      scrollToMonth(month, smooth)
    }
  }, [weeks, view, scrollToMonth])

  // Rows fill the screen five at a time, but never shrink below MIN_ROW_PX
  useEffect(() => {
    const el = scrollRef.current
    if (!el || view !== 'month') return
    const ro = new ResizeObserver(() => setRowPx(Math.max(MIN_ROW_PX, Math.floor(el.clientHeight / 5))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

  const onMonthScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // The month most of the top row belongs to
    const top = rowRefs.current.findIndex(r => r && r.offsetTop + r.offsetHeight / 2 > el.scrollTop)
    const week = weeks[top]
    if (week) {
      const month = week[Math.floor(week.length / 2)].slice(0, 7)
      if (month !== visibleMonth) setVisibleMonth(month)
    }
    // Grow at either end (one extension at a time)
    if (heightBeforePrepend.current !== null || pendingScroll.current) return
    if (el.scrollTop < EDGE_PX) {
      heightBeforePrepend.current = el.scrollHeight
      setRange(r => ({ ...r, from: addMonths(`${r.from}-01`, -EXTEND_MONTHS) }))
    } else if (el.scrollTop + el.clientHeight > el.scrollHeight - EDGE_PX) {
      setRange(r => ({ ...r, to: addMonths(`${r.to}-01`, EXTEND_MONTHS) }))
    }
  }

  const shift = (dir: 1 | -1) => {
    if (view === 'week') { setAnchor(a => addDays(a, 7 * dir)); return }
    scrollToMonth(addMonths(`${visibleMonth}-01`, dir), true)
  }

  const goToday = () => {
    setAnchor(today)
    if (view === 'month') scrollToMonth(addMonths(today, 0), true)
  }

  const switchToView = (v: View) => {
    // Leaving the month view: show a week of the month being looked at
    if (v === 'week' && view === 'month') setAnchor(visibleMonth === today.slice(0, 7) ? today : `${visibleMonth}-01`)
    switchView(v)
  }

  const rangeLabel = view === 'week'
    ? `${parseLocalDate(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseLocalDate(days[days.length - 1]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : monthLabel(visibleMonth)

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
          <ENTITY_ICONS.project className="h-3 w-3 shrink-0" />
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

  // One day's cell. `month` is set in the month view: days outside the month at the
  // top of the scroll are dimmed, and the first shown day of each month is labelled.
  const dayCell = (day: string, month?: { outside: boolean; startsMonth: boolean }) => {
    const items = (itemsByDate.get(day) ?? [])
      .slice()
      .sort((a, b) => (a.kind === 'project' ? 0 : 1) - (b.kind === 'project' ? 0 : 1))
    const level = rateDay(day, items.length, today, businessDays, baseline)
    const d = parseLocalDate(day)
    const shown = month ? items.slice(0, MONTH_LIMIT) : items
    return (
      <div key={day}
        className={`border-r border-b p-1.5 flex flex-col gap-1 min-w-0 transition-opacity ${LEVEL_STYLE[level].cell} ${month?.outside ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between gap-1">
          <button type="button"
            onClick={() => { setAnchor(day); switchView('week') }}
            title="Show this week"
            className={`text-xs rounded px-1 ${day === today ? 'bg-primary text-primary-foreground font-semibold' : month?.startsMonth ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {!month
              ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : month.startsMonth ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.getDate()}
          </button>
          <LoadBadge level={level} count={items.length} />
        </div>
        {shown.map(item => itemChip(item, !!month, day))}
        {month && items.length > MONTH_LIMIT && (
          <button type="button" onClick={() => { setAnchor(day); switchView('week') }}
            className="text-[10px] text-muted-foreground hover:text-foreground text-left px-1.5">
            +{items.length - MONTH_LIMIT} more
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <SCREEN_ICONS.calendar className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Calendar</h1>
        <div className="flex items-center rounded-md border overflow-hidden">
          {(['week', 'month'] as const).map(v => (
            <button key={v} type="button" onClick={() => switchToView(v)}
              className={`h-7 px-2.5 text-xs font-medium border-r last:border-r-0 transition-colors ${view === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shift(-1)} title={view === 'week' ? 'Previous week' : 'Previous month'}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[12rem] text-center">{rangeLabel}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shift(1)} title={view === 'week' ? 'Next week' : 'Next month'}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7" onClick={goToday}>Today</Button>
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
      {view === 'week' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid h-full"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: 'minmax(100%, auto)' }}>
            {days.map(day => dayCell(day))}
          </div>
        </div>
      ) : (
        // Month view: weeks scroll continuously from month to month
        <div ref={scrollRef} onScroll={onMonthScroll} className="relative flex-1 min-h-0 overflow-y-auto">
          {weeks.map((week, i) => (
            <div key={week[0]} ref={el => { rowRefs.current[i] = el }} className="grid"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, minHeight: rowPx }}>
              {week.map((day, j) => {
                const prev = j > 0 ? week[j - 1] : weeks[i - 1]?.at(-1)
                return dayCell(day, {
                  outside: day.slice(0, 7) !== visibleMonth,
                  startsMonth: !prev || prev.slice(0, 7) !== day.slice(0, 7),
                })
              })}
            </div>
          ))}
        </div>
      )}

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
