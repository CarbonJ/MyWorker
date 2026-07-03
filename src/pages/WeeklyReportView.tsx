import { useState, useEffect, useCallback, useMemo } from 'react'
import { getWorkLogByDateRange, type WorkLogEntryWithProject } from '@/db/workLog'
import { getLinkedNotebookEntriesByDateRange, type LinkedNotebookEntry } from '@/db/notebook'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { RagBadge } from '@/components/RagBadge'
import type { RagStatus } from '@/types'
import { ChevronLeft, ChevronRight, Copy, Check, FileText, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useSearch } from '@/contexts/SearchContext'
import { useNavigate } from 'react-router-dom'
import { toLocalDateString } from '@/lib/utils'

// ── date helpers ─────────────────────────────────────────────────────────────

function getWeekStart(ref: Date): Date {
  const d = new Date(ref)
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatRange(start: string, end: string): string {
  const s = parseLocalDate(start)
  const e = parseLocalDate(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.toLocaleDateString(undefined, { ...opts, year: 'numeric' })} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`
}

function formatEntryDate(createdAt: string): string {
  const d = new Date(createdAt.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatEntryTime(createdAt: string): string {
  const d = new Date(createdAt.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// ── markdown → plain text for clipboard ──────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, (m) => m.replace(/`/g, '').trim())
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .trim()
}

// ── grouping ──────────────────────────────────────────────────────────────────

interface ProjectGroup {
  projectId: number
  projectName: string
  ragStatus: string
  latestStatus: string
  entries: WorkLogEntryWithProject[]
  notebooks: LinkedNotebookEntry[]
}

function mergeGroups(workLog: WorkLogEntryWithProject[], notebooks: LinkedNotebookEntry[]): ProjectGroup[] {
  const map = new Map<number, ProjectGroup>()
  for (const e of workLog) {
    if (!map.has(e.projectId)) {
      map.set(e.projectId, {
        projectId: e.projectId,
        projectName: e.projectName,
        ragStatus: e.ragStatus ?? 'Green',
        latestStatus: e.latestStatus ?? '',
        entries: [],
        notebooks: [],
      })
    }
    map.get(e.projectId)!.entries.push(e)
  }
  for (const n of notebooks) {
    if (!map.has(n.projectId)) {
      map.set(n.projectId, {
        projectId: n.projectId,
        projectName: n.projectName,
        ragStatus: 'Green',
        latestStatus: '',
        entries: [],
        notebooks: [],
      })
    }
    map.get(n.projectId)!.notebooks.push(n)
  }
  return Array.from(map.values())
}

// ── clipboard text builder ────────────────────────────────────────────────────

function buildPlainText(groups: ProjectGroup[], rangeLabel: string): string {
  const lines: string[] = [
    `WEEKLY STATUS REPORT`,
    `Week of ${rangeLabel}`,
    '',
  ]
  for (const g of groups) {
    lines.push('─'.repeat(48))
    lines.push(`${g.projectName}  [${g.ragStatus.toUpperCase()}]`)
    if (g.latestStatus) lines.push(`Status: ${g.latestStatus}`)
    lines.push('')
    for (const e of g.entries) {
      const date = formatEntryDate(e.createdAt)
      const time = formatEntryTime(e.createdAt)
      const note = stripMarkdown(e.note)
      lines.push(`${date} ${time}`)
      note.split('\n').filter(Boolean).forEach(l => lines.push(`  ${l}`))
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

// ── journal helpers ───────────────────────────────────────────────────────────

function getJournalEntry(dateStr: string): string {
  return localStorage.getItem(`myworker:digest-meetings:${dateStr}`) ?? ''
}

function getWeekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toLocalDateString(addDays(start, i)))
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// ── component ─────────────────────────────────────────────────────────────────

export default function WeeklyReportView() {
  const navigate = useNavigate()
  const todayDate = new Date()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayDate))
  const [entries, setEntries] = useState<WorkLogEntryWithProject[]>([])
  const [notebooks, setNotebooks] = useState<LinkedNotebookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const weekEnd = addDays(weekStart, 6)
  const startStr = toLocalDateString(weekStart)
  const endStr = toLocalDateString(weekEnd)
  const rangeLabel = formatRange(startStr, endStr)
  const isCurrentWeek = startStr === toLocalDateString(getWeekStart(todayDate))

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getWorkLogByDateRange(startStr, endStr),
      getLinkedNotebookEntriesByDateRange(startStr, endStr),
    ]).then(([wl, nb]) => { setEntries(wl); setNotebooks(nb) })
      .finally(() => setLoading(false))
  }, [startStr, endStr])

  const groups = mergeGroups(entries, notebooks)
  const { query } = useSearch()

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    const terms = q.split(/\s+/).filter(Boolean)
    return groups
      .map(group => {
        const nameMatches = terms.every(t => group.projectName.toLowerCase().includes(t))
        if (nameMatches) return group
        const matchingEntries = group.entries.filter(e =>
          terms.every(t => e.note.toLowerCase().includes(t))
        )
        const matchingNotebooks = group.notebooks.filter(n =>
          terms.every(t => n.title.toLowerCase().includes(t))
        )
        return (matchingEntries.length > 0 || matchingNotebooks.length > 0)
          ? { ...group, entries: matchingEntries, notebooks: matchingNotebooks }
          : null
      })
      .filter(Boolean) as ProjectGroup[]
  }, [groups, query])

  const copyToClipboard = useCallback(async () => {
    const text = buildPlainText(filteredGroups, rangeLabel)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Report copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy — try selecting the text manually')
    }
  }, [groups, rangeLabel])

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4 flex items-center gap-3 flex-wrap">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Weekly Report</h1>

        {/* Week navigation */}
        <div className="flex items-center gap-1 ml-4">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0"
            onClick={() => setWeekStart(w => addDays(w, -7))} title="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[16rem] text-center">
            {rangeLabel}
          </span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0"
            onClick={() => setWeekStart(w => addDays(w, 7))} title="Next week"
            disabled={isCurrentWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentWeek && (
          <Button variant="outline" size="sm" className="h-7 ml-1"
            onClick={() => setWeekStart(getWeekStart(todayDate))}>
            This Week
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {loading ? '' : groups.length === 0
              ? 'No entries'
              : `${filteredGroups.length} project${filteredGroups.length === 1 ? '' : 's'}`}
          </span>
          {filteredGroups.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy Report'}
            </Button>
          )}
        </div>
      </div>

      {/* Report body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">

        {/* Journal entries for the week */}
        {(() => {
          const days = getWeekDates(weekStart).map(d => ({ date: d, text: getJournalEntry(d) })).filter(d => d.text.trim())
          if (days.length === 0) return null
          return (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-3">Journal</h2>
              <div className="border rounded-lg divide-y divide-border">
                {days.map(({ date, text }) => (
                  <div key={date} className="px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-1">{formatDayLabel(date)}</p>
                    <WikiLinkContent>{text}</WikiLinkContent>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="text-sm">No work log entries for this week.</p>
          </div>
        )}

        {!loading && entries.length > 0 && filteredGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <FileText className="h-8 w-8 opacity-30" />
            <p className="text-sm">No entries match <strong>{query}</strong>.</p>
          </div>
        )}

        {!loading && filteredGroups.map(group => (
          <div key={group.projectId} className="mb-8">
            {/* Project header */}
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold">{group.projectName}</h2>
              {group.ragStatus !== 'Green' || group.entries.length > 0 ? <RagBadge status={group.ragStatus as RagStatus} /> : null}
            </div>
            {group.latestStatus && (
              <p className="text-sm text-muted-foreground mb-3 pl-0.5">
                <span className="font-medium text-foreground">Status:</span> {group.latestStatus}
              </p>
            )}

            {/* Work log + linked notebook entries */}
            <div className="border rounded-lg divide-y divide-border">
              {group.entries.map(entry => (
                <div key={`wl-${entry.id}`} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatEntryDate(entry.createdAt)} · {formatEntryTime(entry.createdAt)}
                  </p>
                  <WikiLinkContent>{entry.note}</WikiLinkContent>
                </div>
              ))}
              {group.notebooks.map(nb => (
                <div key={`nb-${nb.pageId}`} className="px-4 py-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {formatEntryDate(nb.updatedAt)} · {formatEntryTime(nb.updatedAt)}
                  </p>
                  <button
                    onClick={() => navigate(`/notebook?page=${nb.pageId}`)}
                    className="text-sm text-primary hover:underline text-left"
                  >
                    {nb.title || 'Untitled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
