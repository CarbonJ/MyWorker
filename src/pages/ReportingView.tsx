import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useSearch } from '@/contexts/SearchContext'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllTasks } from '@/db/tasks'
import { getAllWorkLogEntries } from '@/db/workLog'
import type { Project, DropdownOption, RagStatus, Task, WorkLogEntry } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { ReportingExportModal } from '@/components/ReportingExportModal'
import { Button } from '@/components/ui/button'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { RAG_ORDER, pillClass, dotClass } from '@/lib/colors'
import { loadGuiSettings, buttonStyle } from '@/lib/guiSettings'
import { useDataLoader } from '@/hooks/useDataLoader'
import { fmtDate, isOverdue } from '@/lib/utils'

type SortKey = 'staleness' | 'ragStatus' | 'workItem' | 'productArea' | 'priority' | 'latestStatus' | 'projectStatus' | 'openTasks'
type SortEntry = { key: SortKey; dir: 'asc' | 'desc' }

interface PageData {
  projects: Project[]
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  allTasks: Task[]
  allWorkLog: WorkLogEntry[]
}

function ExpandableText({ children, textKey }: { children: ReactNode; textKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isClamped, setIsClamped] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    if (expanded) return
    const el = ref.current
    if (!el) return
    setIsClamped(el.scrollHeight > el.clientHeight)
  }, [textKey, expanded])

  return (
    <div>
      <div ref={ref} className={!expanded ? 'line-clamp-3' : undefined}>
        {children}
      </div>
      {(isClamped || expanded) && (
        <button
          className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none mt-0.5 flex items-center gap-0.5"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? '↑' : '… ↓'}
        </button>
      )}
    </div>
  )
}

const RAG_FILTER_OPTIONS: { value: RagStatus; label: string; dotColor: string }[] = [
  { value: 'Green', label: 'Green', dotColor: 'bg-green-500' },
  { value: 'Amber', label: 'Amber', dotColor: 'bg-amber-400' },
  { value: 'Red',   label: 'Red',   dotColor: 'bg-red-500' },
]

function stalenessColor(days: number): string {
  if (days < 7)  return 'text-green-600 dark:text-green-400'
  if (days < 30) return 'text-amber-600 dark:text-amber-500'
  return 'text-red-600 dark:text-red-400'
}

function StatCard({ label, value, valueClass = 'text-foreground' }: {
  label: string; value: number; valueClass?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center bg-accent/40 rounded-lg px-4 py-2 min-w-[72px]">
      <span className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5 text-center">{label}</span>
    </div>
  )
}

export default function ReportingView() {
  const navigate = useNavigate()
  const { query } = useSearch()
  const [sorts, setSorts] = useState<SortEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('myworker:reporting-sorts') ?? 'null') ?? [{ key: 'ragStatus', dir: 'asc' }] }
    catch { return [{ key: 'ragStatus', dir: 'asc' }] }
  })

  // Filters (empty array = All)
  const [ragFilters,      setRagFilters]      = useState<RagStatus[]>([])
  const [areaFilters,     setAreaFilters]     = useState<string[]>([])
  const [statusFilters,   setStatusFilters]   = useState<string[]>([])
  const [filterInsights,  setFilterInsights]  = useState(false)

  // Export modal
  const [exportOpen, setExportOpen] = useState(false)

  // Metrics panel
  const [metricsOpen, setMetricsOpen] = useState(
    () => localStorage.getItem('myworker:reportingMetricsOpen') !== 'false'
  )
  const [exportFormat, setExportFormat] = useState<'brief' | 'detailed'>('detailed')

  const toggleMetrics = () => {
    setMetricsOpen(v => {
      const next = !v
      localStorage.setItem('myworker:reportingMetricsOpen', String(next))
      return next
    })
  }

  const { buttonColor, buttonOpacity } = loadGuiSettings()
  const btnStyle = buttonStyle(buttonColor, buttonOpacity)

  const { data, reload: load } = useDataLoader<PageData>(
    async () => {
      const [projects, priorities, productAreas, projectStatuses, allTasks, allWorkLog] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
        getAllTasks(),
        getAllWorkLogEntries(),
      ])
      return { projects, priorities, productAreas, projectStatuses, allTasks, allWorkLog }
    },
    'Failed to load projects',
  )

  const projects        = data?.projects        ?? []
  const priorities      = data?.priorities      ?? []
  const productAreas    = data?.productAreas    ?? []
  const projectStatuses = data?.projectStatuses ?? []
  const allTasks        = data?.allTasks        ?? []
  const allWorkLog      = data?.allWorkLog      ?? []

  const labelFor = (opts: DropdownOption[], id: number | null) =>
    opts.find(o => o.id === id)?.label ?? '—'

  const handleSort = (key: SortKey) => {
    setSorts(prev => {
      const next = (() => {
        const existing = prev.find(s => s.key === key)
        if (!existing) return [...prev, { key, dir: 'asc' as const }]
        if (existing.dir === 'asc') return prev.map(s => s.key === key ? { ...s, dir: 'desc' as const } : s)
        return prev.filter(s => s.key !== key)
      })()
      localStorage.setItem('myworker:reporting-sorts', JSON.stringify(next))
      return next
    })
  }

  // ── Derived lookups ──────────────────────────────────────────────────────────

  /** Latest work log entry per project (allWorkLog is already DESC by createdAt) */
  const latestLogByProject = useMemo(() => {
    const map = new Map<number, WorkLogEntry>()
    for (const entry of allWorkLog) {
      if (!map.has(entry.projectId)) map.set(entry.projectId, entry)
    }
    return map
  }, [allWorkLog])

  /** Open/in-progress task counts per project */
  const taskCountsByProject = useMemo(() => {
    const map = new Map<number, { open: number; inProgress: number }>()
    for (const t of allTasks) {
      if (t.projectId === null || t.status === 'done') continue
      const cur = map.get(t.projectId) ?? { open: 0, inProgress: 0 }
      if (t.status === 'open') cur.open++
      else if (t.status === 'in_progress') cur.inProgress++
      map.set(t.projectId, cur)
    }
    return map
  }, [allTasks])

  // ── Staleness map (independent of project filtering) ─────────────────────────

  const stalenessMap = useMemo(() => {
    const today = Date.now()
    const map = new Map<number, number>()
    for (const entry of allWorkLog) {
      if (!map.has(entry.projectId)) {
        map.set(entry.projectId, Math.max(0, Math.floor((today - new Date(entry.createdAt).getTime()) / 86_400_000)))
      }
    }
    return map
  }, [allWorkLog])

  // ── Filtered + sorted list ───────────────────────────────────────────────────

  const sorted = useMemo(() => {
    let list = [...projects]

    if (ragFilters.length > 0)    list = list.filter(p => ragFilters.includes(p.ragStatus))
    if (areaFilters.length > 0)   list = list.filter(p => areaFilters.includes(String(p.productAreaId ?? '')))
    if (statusFilters.length > 0) list = list.filter(p => statusFilters.includes(String(p.statusId ?? '')))

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(p =>
        p.workItem.toLowerCase().includes(q) ||
        p.latestStatus.toLowerCase().includes(q)
      )
    }

    return list.sort((a, b) => {
      for (const { key, dir } of sorts) {
        let av: string | number = ''
        let bv: string | number = ''
        switch (key) {
          case 'staleness':     av = stalenessMap.get(a.id) ?? Infinity; bv = stalenessMap.get(b.id) ?? Infinity; break
          case 'ragStatus':     av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
          case 'workItem':      av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
          case 'productArea':   av = labelFor(productAreas, a.productAreaId).toLowerCase(); bv = labelFor(productAreas, b.productAreaId).toLowerCase(); break
          case 'priority':      av = labelFor(priorities, a.priorityId).toLowerCase(); bv = labelFor(priorities, b.priorityId).toLowerCase(); break
          case 'latestStatus':  av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
          case 'projectStatus': av = labelFor(projectStatuses, a.statusId).toLowerCase(); bv = labelFor(projectStatuses, b.statusId).toLowerCase(); break
          case 'openTasks': {
            const ac = taskCountsByProject.get(a.id); av = ac ? ac.open + ac.inProgress : 0
            const bc = taskCountsByProject.get(b.id); bv = bc ? bc.open + bc.inProgress : 0
            break
          }
        }
        if (av < bv) return dir === 'asc' ? -1 : 1
        if (av > bv) return dir === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [projects, sorts, ragFilters, areaFilters, statusFilters, query, priorities, productAreas, projectStatuses, taskCountsByProject, stalenessMap])

  // ── Metrics (single pass) ────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const today = Date.now()

    // When filterInsights is on, scope all metrics to the filtered project set
    const ps = filterInsights ? sorted : projects
    const projectIds = filterInsights ? new Set(ps.map(p => p.id)) : null
    const scopedTasks   = projectIds ? allTasks.filter(t => t.projectId !== null && projectIds.has(t.projectId!)) : allTasks
    const scopedWorkLog = projectIds ? allWorkLog.filter(e => projectIds.has(e.projectId)) : allWorkLog

    // RAG counts
    const ragCounts = { Red: 0, Amber: 0, Green: 0 }
    for (const p of ps) ragCounts[p.ragStatus]++

    // Effective staleness: days since last log entry, or days since project creation if no log
    const effectiveStaleness = (p: { id: number; createdAt: string }) =>
      stalenessMap.get(p.id) ?? Math.max(0, Math.floor((today - new Date(p.createdAt).getTime()) / 86_400_000))

    // Stale: no log in 14+ days (or no log at all and project itself is 14+ days old)
    const staleCount = ps.filter(p => effectiveStaleness(p) >= 14).length

    // Overdue tasks
    const overdueTaskCount = scopedTasks.filter(t => t.status !== 'done' && isOverdue(t.dueDate)).length

    // Area bars
    const areaCounts = new Map<number, number>()
    for (const p of ps) {
      if (p.productAreaId !== null)
        areaCounts.set(p.productAreaId, (areaCounts.get(p.productAreaId) ?? 0) + 1)
    }
    const noAreaCount = ps.filter(p => p.productAreaId === null).length
    const maxAreaCount = Math.max(...[...areaCounts.values(), noAreaCount].filter(Boolean), 1)
    const areaBarData = [
      ...productAreas
        .map(a => ({ label: a.label, count: areaCounts.get(a.id) ?? 0, pct: (areaCounts.get(a.id) ?? 0) / maxAreaCount * 100 }))
        .filter(d => d.count > 0),
      ...(noAreaCount > 0 ? [{ label: 'No Area', count: noAreaCount, pct: noAreaCount / maxAreaCount * 100 }] : []),
    ]

    // Attention: stale 14d+, Red first then most stale
    const attentionProjects = ps
      .filter(p => effectiveStaleness(p) >= 14)
      .sort((a, b) => {
        const rd = RAG_ORDER[a.ragStatus] - RAG_ORDER[b.ragStatus]
        if (rd !== 0) return rd
        return effectiveStaleness(b) - effectiveStaleness(a)
      })
      .slice(0, 8)

    // 1. Red × Overdue compound risk
    const overdueTaskProjectIds = new Set<number>()
    for (const t of scopedTasks) {
      if (t.status !== 'done' && isOverdue(t.dueDate) && t.projectId !== null)
        overdueTaskProjectIds.add(t.projectId)
    }
    const redOverdueProjects = ps.filter(p => p.ragStatus === 'Red' && overdueTaskProjectIds.has(p.id))

    // 3. Priority distribution bar
    const priorityCounts = new Map<number, number>()
    for (const p of ps) {
      if (p.priorityId !== null)
        priorityCounts.set(p.priorityId, (priorityCounts.get(p.priorityId) ?? 0) + 1)
    }
    const noPriorityCount = ps.filter(p => p.priorityId === null).length
    const maxPriorityCount = Math.max(...[...priorityCounts.values(), noPriorityCount].filter(Boolean), 1)
    const priorityBarData = [
      ...priorities
        .map(pr => ({ label: pr.label, count: priorityCounts.get(pr.id) ?? 0, pct: (priorityCounts.get(pr.id) ?? 0) / maxPriorityCount * 100 }))
        .filter(d => d.count > 0),
      ...(noPriorityCount > 0 ? [{ label: 'No Priority', count: noPriorityCount, pct: noPriorityCount / maxPriorityCount * 100 }] : []),
    ]

    // 4. Most active projects (last 14d)
    const fourteenDaysAgo = today - 14 * 86_400_000
    const activityCounts = new Map<number, number>()
    for (const entry of scopedWorkLog) {
      if (new Date(entry.createdAt).getTime() > fourteenDaysAgo)
        activityCounts.set(entry.projectId, (activityCounts.get(entry.projectId) ?? 0) + 1)
    }
    const mostActiveProjects = [...activityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ project: ps.find(p => p.id === id)!, count }))
      .filter(x => x.project)

    // 5. RAG health by area
    const ragByAreaMap = new Map<number, { Red: number; Amber: number; Green: number }>()
    for (const p of ps) {
      if (p.productAreaId === null) continue
      const cur = ragByAreaMap.get(p.productAreaId) ?? { Red: 0, Amber: 0, Green: 0 }
      cur[p.ragStatus]++
      ragByAreaMap.set(p.productAreaId, cur)
    }
    const ragByAreaData = productAreas
      .filter(a => ragByAreaMap.has(a.id))
      .map(a => {
        const counts = ragByAreaMap.get(a.id)!
        const total = counts.Red + counts.Amber + counts.Green
        return { label: a.label, ...counts, total }
      })

    // 8. Projects with no open tasks
    const projectsWithOpenTasks = new Set<number>()
    for (const t of scopedTasks) {
      if (t.projectId !== null && t.status !== 'done') projectsWithOpenTasks.add(t.projectId)
    }
    const noOpenTasksProjects = ps.filter(p => !projectsWithOpenTasks.has(p.id))

    // 9. Activity pulse (this week vs last week)
    const sevenDaysAgo = today - 7 * 86_400_000
    let activityThisWeek = 0
    let activityLastWeek = 0
    for (const entry of scopedWorkLog) {
      const t = new Date(entry.createdAt).getTime()
      if (t > sevenDaysAgo) activityThisWeek++
      else if (t > fourteenDaysAgo) activityLastWeek++
    }

    // 10. Projects with no due date
    const noDueDateCount = ps.filter(p => !p.dueDate).length

    return {
      ragCounts, staleCount, overdueTaskCount, areaBarData, attentionProjects,
      redOverdueProjects, priorityBarData, mostActiveProjects,
      ragByAreaData, noOpenTasksProjects,
      activityPulse: { thisWeek: activityThisWeek, lastWeek: activityLastWeek },
      noDueDateCount,
    }
  }, [projects, sorted, filterInsights, allWorkLog, allTasks, productAreas, priorities, stalenessMap])

  const SortIcon = ({ col }: { col: SortKey }) => {
    const idx = sorts.findIndex(s => s.key === col)
    if (idx === -1) return <span className="ml-1 opacity-30">↕</span>
    const { dir } = sorts[idx]
    return (
      <span className={`ml-1 ${dir === 'asc' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-500'}`}>
        {sorts.length > 1 ? <sup className="text-[9px] mr-px">{idx + 1}</sup> : null}{dir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const thClass = 'px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'
  const filtersActive = ragFilters.length > 0 || areaFilters.length > 0 || statusFilters.length > 0

  // RAG bar widths (derived from metrics so they reflect filterInsights scoping)
  const total = (metrics.ragCounts.Red + metrics.ragCounts.Amber + metrics.ragCounts.Green) || 1
  const ragRedPct   = metrics.ragCounts.Red   / total * 100
  const ragAmberPct = metrics.ragCounts.Amber / total * 100
  const ragGreenPct = metrics.ragCounts.Green / total * 100

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0 flex-wrap">
        <div className="mr-2">
          <h1 className="text-lg font-semibold leading-tight">Reporting</h1>
          <p className="text-xs text-muted-foreground">{sorted.length} of {projects.length} projects · read-only</p>
        </div>

        {/* RAG filter */}
        <MultiSelectFilter
          options={RAG_FILTER_OPTIONS.map(o => ({
            value: o.value,
            label: o.label,
            prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />,
          }))}
          value={ragFilters}
          onChange={v => setRagFilters(v as RagStatus[])}
          placeholder="All RAG"
          width="w-32"
        />

        {/* Product Area filter */}
        <MultiSelectFilter
          options={productAreas.map(a => ({ value: String(a.id), label: a.label }))}
          value={areaFilters}
          onChange={setAreaFilters}
          placeholder="All Areas"
          width="w-40"
        />

        {/* Status filter */}
        <MultiSelectFilter
          options={projectStatuses.map(s => ({
            value: String(s.id),
            label: s.label,
            prefix: s.color ? <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(s.color)}`} /> : undefined,
          }))}
          value={statusFilters}
          onChange={setStatusFilters}
          placeholder="All Statuses"
          width="w-40"
        />

        {/* Reset filters */}
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilters([]); setAreaFilters([]); setStatusFilters([]) }}
          >
            ✕ Reset filters
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleMetrics} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {metricsOpen ? '⌃ Hide insights' : '⌄ Show insights'}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary cursor-pointer"
              checked={filterInsights}
              onChange={e => setFilterInsights(e.target.checked)}
            />
            <span className="text-xs text-muted-foreground">Filter insights</span>
          </label>
          <Button variant="outline" size="sm" className="h-8 text-xs" style={btnStyle} onClick={() => setExportOpen(true)}>
            Export…
          </Button>
          <button
            onClick={load}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Metrics Panel ────────────────────────────────────────────────── */}
      {metricsOpen && (
        <div className="shrink-0 max-h-[44vh] overflow-auto border-b-2 border-b-border/60 px-6 py-4 space-y-4 bg-accent/10">

          {/* Row 1 — Stat cards + distribution charts */}
          <div className="flex gap-6 flex-wrap items-start">
            {/* Stat cards */}
            <div className="flex gap-3 flex-wrap">
              <StatCard label="Projects" value={projects.length} />
              <StatCard label="Red" value={metrics.ragCounts.Red} valueClass="text-red-600" />
              <StatCard label="Amber" value={metrics.ragCounts.Amber} valueClass="text-amber-600" />
              <StatCard label="Green" value={metrics.ragCounts.Green} valueClass="text-green-600" />
              <StatCard label="Stale 14d+" value={metrics.staleCount} valueClass={metrics.staleCount > 0 ? 'text-amber-600' : 'text-muted-foreground'} />
              <StatCard label="Overdue tasks" value={metrics.overdueTaskCount} valueClass={metrics.overdueTaskCount > 0 ? 'text-red-600' : 'text-muted-foreground'} />
              <StatCard label="No due date" value={metrics.noDueDateCount} valueClass="text-muted-foreground" />
            </div>

            {/* Divider */}
            <div className="self-stretch w-px bg-border" />

            {/* Distribution charts */}
            <div className="flex gap-8 flex-wrap items-start">
              {/* RAG bar */}
              {projects.length > 0 && (
                <div className="space-y-1 min-w-[160px]">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">RAG distribution</p>
                  <div className="flex h-3 rounded overflow-hidden w-48">
                    {ragRedPct   > 0 && <div className="bg-red-500"   style={{ width: `${ragRedPct}%` }} />}
                    {ragAmberPct > 0 && <div className="bg-amber-400" style={{ width: `${ragAmberPct}%` }} />}
                    {ragGreenPct > 0 && <div className="bg-green-500" style={{ width: `${ragGreenPct}%` }} />}
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    {metrics.ragCounts.Red   > 0 && <span className="text-red-600">{metrics.ragCounts.Red} Red</span>}
                    {metrics.ragCounts.Amber > 0 && <span className="text-amber-600">{metrics.ragCounts.Amber} Amber</span>}
                    {metrics.ragCounts.Green > 0 && <span className="text-green-600">{metrics.ragCounts.Green} Green</span>}
                  </div>
                </div>
              )}

              {/* Area bars */}
              {metrics.areaBarData.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">By area</p>
                  <div className="space-y-1">
                    {metrics.areaBarData.map(d => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-24 truncate">{d.label}</span>
                        <div className="h-2 rounded bg-blue-500/70" style={{ width: `${Math.max(d.pct, 4)}%`, minWidth: '4px', maxWidth: '120px' }} />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority distribution bars */}
              {metrics.priorityBarData.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">By priority</p>
                  <div className="space-y-1">
                    {metrics.priorityBarData.map(d => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-24 truncate">{d.label}</span>
                        <div className="h-2 rounded bg-violet-500/70" style={{ width: `${Math.max(d.pct, 4)}%`, minWidth: '4px', maxWidth: '120px' }} />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RAG health by area */}
              {metrics.ragByAreaData.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">RAG by area</p>
                  <div className="space-y-1">
                    {metrics.ragByAreaData.map(d => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-24 truncate">{d.label}</span>
                        <div className="flex h-2 rounded overflow-hidden w-20">
                          {d.Red   > 0 && <div className="bg-red-500"   style={{ width: `${d.Red   / d.total * 100}%` }} />}
                          {d.Amber > 0 && <div className="bg-amber-400" style={{ width: `${d.Amber / d.total * 100}%` }} />}
                          {d.Green > 0 && <div className="bg-green-500" style={{ width: `${d.Green / d.total * 100}%` }} />}
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{d.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3 — Risk signals */}
          <div className="flex gap-0 flex-wrap items-start divide-x divide-border">

            {/* Red × Overdue compound risk */}
            {metrics.redOverdueProjects.length > 0 && (
              <div
                className="space-y-1 cursor-pointer group pr-6"
                onClick={() => setRagFilters(['Red'])}
                title="Click to filter table to Red projects"
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Red + overdue tasks</p>
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 group-hover:bg-red-500/20 transition-colors">
                  <span className="text-red-600 font-bold text-base tabular-nums">{metrics.redOverdueProjects.length}</span>
                  <span className="text-[11px] text-red-700 dark:text-red-400">
                    Red project{metrics.redOverdueProjects.length !== 1 ? 's' : ''} with overdue tasks
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {metrics.redOverdueProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={e => { e.stopPropagation(); navigate(`/projects/${p.id}`) }}
                      className="text-[10px] text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 hover:bg-red-500/20 transition-colors"
                    >
                      {p.workItem}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Most active projects */}
            {metrics.mostActiveProjects.length > 0 && (
              <div className="space-y-1 px-6">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Most active (14d)</p>
                <div className="space-y-1">
                  {metrics.mostActiveProjects.map(({ project: p, count }) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-32 truncate text-left"
                        title={p.workItem}
                      >
                        {p.workItem}
                      </button>
                      <div className="h-2 rounded bg-emerald-500/70" style={{ width: `${count / (metrics.mostActiveProjects[0]?.count || 1) * 80}px`, minWidth: '4px' }} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity pulse */}
            <div className="space-y-1 px-6">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Activity pulse</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums">{metrics.activityPulse.thisWeek}</span>
                <span className="text-[10px] text-muted-foreground">log entries this week</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground tabular-nums">{metrics.activityPulse.lastWeek} last week</span>
                {metrics.activityPulse.thisWeek > metrics.activityPulse.lastWeek && (
                  <span className="text-[10px] text-green-600">↑</span>
                )}
                {metrics.activityPulse.thisWeek < metrics.activityPulse.lastWeek && (
                  <span className="text-[10px] text-amber-600">↓</span>
                )}
                {metrics.activityPulse.thisWeek === metrics.activityPulse.lastWeek && metrics.activityPulse.thisWeek > 0 && (
                  <span className="text-[10px] text-muted-foreground">→</span>
                )}
              </div>
            </div>

            {/* Projects with no open tasks */}
            {metrics.noOpenTasksProjects.length > 0 && (
              <div className="space-y-1 pl-6">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">No open tasks</p>
                <p className="text-base font-bold tabular-nums">{metrics.noOpenTasksProjects.length}</p>
                <p className="text-[10px] text-muted-foreground">project{metrics.noOpenTasksProjects.length !== 1 ? 's' : ''} with no tracked work</p>
                <div className="flex gap-1 flex-wrap max-w-[200px]">
                  {metrics.noOpenTasksProjects.slice(0, 4).map(p => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="text-[10px] text-muted-foreground bg-accent/60 border rounded-full px-2 py-0.5 hover:bg-accent transition-colors truncate max-w-[96px]"
                      title={p.workItem}
                    >
                      {p.workItem}
                    </button>
                  ))}
                  {metrics.noOpenTasksProjects.length > 4 && (
                    <span className="text-[10px] text-muted-foreground/60 py-0.5">+{metrics.noOpenTasksProjects.length - 4}</span>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Row 4 — Attention list */}
          {metrics.attentionProjects.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Needs attention (stale 14d+)</p>
              <div className="flex gap-2 flex-wrap">
                {metrics.attentionProjects.map(p => {
                  const logDays = stalenessMap.get(p.id)
                  const days = logDays ?? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86_400_000))
                  const ragDot = p.ragStatus === 'Red' ? '🔴' : p.ragStatus === 'Amber' ? '🟡' : '🟢'
                  const ageLabel = logDays === undefined ? `no log · ${days}d old` : `${days}d ago`
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="inline-flex items-center gap-1 text-[11px] bg-accent/60 border rounded-full px-2.5 py-0.5 hover:bg-accent hover:border-foreground/20 transition-colors cursor-pointer"
                    >
                      <span>{ragDot}</span>
                      <span className="font-medium">{p.workItem}</span>
                      <span className="text-muted-foreground">· {ageLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass} onClick={() => handleSort('staleness')} title="Days since last work log entry"><Clock className="inline w-3.5 h-3.5 mb-0.5" /><SortIcon col="staleness" /></th>
              <th className={thClass} onClick={() => handleSort('ragStatus')}>RAG<SortIcon col="ragStatus" /></th>
              <th className={thClass} onClick={() => handleSort('workItem')}>Work Item<SortIcon col="workItem" /></th>
              <th className={thClass} onClick={() => handleSort('productArea')}>Product Area<SortIcon col="productArea" /></th>
              <th className={thClass} onClick={() => handleSort('priority')}>Priority<SortIcon col="priority" /></th>
              <th className={thClass} onClick={() => handleSort('projectStatus')}>Status<SortIcon col="projectStatus" /></th>
              <th className={thClass} onClick={() => handleSort('openTasks')}>Tasks<SortIcon col="openTasks" /></th>
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Latest Status<SortIcon col="latestStatus" /></th>
              <th className={thClass}>Latest Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  No projects found.
                </td>
              </tr>
            )}
            {sorted.map(p => {
              const priorityOpt = priorities.find(o => o.id === p.priorityId)
              const statusOpt   = projectStatuses.find(o => o.id === p.statusId)
              const counts      = taskCountsByProject.get(p.id)
              const latestLog   = latestLogByProject.get(p.id)

              const staleDays = stalenessMap.get(p.id)

              return (
                <tr key={p.id} className="hover:bg-accent/50 cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                  {/* Staleness */}
                  <td className="w-px px-3 py-1 whitespace-nowrap text-center">
                    {staleDays !== undefined ? (
                      <span className={`text-xs font-medium tabular-nums ${stalenessColor(staleDays)}`}
                            title={`Last log: ${staleDays}d ago`}>
                        {staleDays}d
                      </span>
                    ) : (
                      <span title="No log entries"><Clock className="inline w-3.5 h-3.5 text-red-500" /></span>
                    )}
                  </td>

                  {/* RAG */}
                  <td className="px-3 py-1"><RagBadge status={p.ragStatus} /></td>

                  {/* Work Item */}
                  <td className={`px-3 py-1 font-medium${p.workItem.length <= 65 ? ' whitespace-nowrap' : ''}`}>{p.workItem}</td>

                  {/* Product Area */}
                  <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">
                    {labelFor(productAreas, p.productAreaId)}
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-1">
                    {priorityOpt ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(priorityOpt.color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass(priorityOpt.color)}`} />
                        {priorityOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Project Status */}
                  <td className="w-px px-3 py-1 whitespace-nowrap">
                    {statusOpt ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${pillClass(statusOpt.color)}`}>
                        {statusOpt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(statusOpt.color)}`} />}
                        {statusOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Open Tasks */}
                  <td className="px-3 py-1 whitespace-nowrap">
                    {counts && (counts.open > 0 || counts.inProgress > 0) ? (
                      <span className="text-xs text-muted-foreground">
                        {counts.open > 0 && <span className="text-slate-700 font-medium">{counts.open} open</span>}
                        {counts.open > 0 && counts.inProgress > 0 && <span> · </span>}
                        {counts.inProgress > 0 && <span className="text-blue-600 font-medium">{counts.inProgress} active</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Latest Status */}
                  <td className="px-3 py-1 max-w-[24rem]">
                    {p.latestStatus
                      ? <ExpandableText textKey={p.latestStatus}>
                          <span className="text-xs text-muted-foreground">{p.latestStatus}</span>
                        </ExpandableText>
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </td>

                  {/* Latest Work Log */}
                  <td className="px-3 py-1 max-w-[20rem]">
                    {latestLog ? (
                      <ExpandableText textKey={latestLog.note}>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium mr-1.5 shrink-0">
                            {fmtDate(latestLog.createdAt.slice(0, 10))}
                          </span>
                          <span>{latestLog.note}</span>
                        </span>
                      </ExpandableText>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      <ReportingExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projects={sorted}
        productAreas={productAreas}
        priorities={priorities}
        projectStatuses={projectStatuses}
        allTasks={allTasks}
        allWorkLog={allWorkLog}
        exportFormat={exportFormat}
        onExportFormatChange={setExportFormat}
      />
    </div>
  )
}
