import { useState, useEffect, useCallback, useMemo } from 'react'
import { getWorkLogByDateRange, type WorkLogEntryWithProject } from '@/db/workLog'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { RagBadge } from '@/components/RagBadge'
import type { RagStatus } from '@/types'
import { ChevronLeft, ChevronRight, Copy, Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useSearch } from '@/contexts/SearchContext'

// ── date helpers ─────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMonthStart(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1)
}

function getMonthEnd(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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
}

function groupByProject(entries: WorkLogEntryWithProject[]): ProjectGroup[] {
  const map = new Map<number, ProjectGroup>()
  for (const e of entries) {
    if (!map.has(e.projectId)) {
      map.set(e.projectId, {
        projectId: e.projectId,
        projectName: e.projectName,
        ragStatus: e.ragStatus ?? 'Green',
        latestStatus: e.latestStatus ?? '',
        entries: [],
      })
    }
    map.get(e.projectId)!.entries.push(e)
  }
  return Array.from(map.values())
}

// ── clipboard text builder ────────────────────────────────────────────────────

function buildPlainText(groups: ProjectGroup[], monthLabel: string): string {
  const lines: string[] = [
    'MONTHLY STATUS REPORT',
    `Month of ${monthLabel}`,
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

function getMonthDates(start: Date, end: Date): string[] {
  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(toLocalDateString(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MonthlyReportView() {
  const today = new Date()
  const [monthStart, setMonthStart] = useState(() => getMonthStart(today))
  const [entries, setEntries] = useState<WorkLogEntryWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const monthEnd = getMonthEnd(monthStart)
  const startStr = toLocalDateString(monthStart)
  const endStr = toLocalDateString(monthEnd)
  const monthLabel = formatMonthLabel(monthStart)
  const isCurrentMonth =
    monthStart.getFullYear() === today.getFullYear() &&
    monthStart.getMonth() === today.getMonth()

  useEffect(() => {
    setLoading(true)
    getWorkLogByDateRange(startStr, endStr)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [startStr, endStr])

  const groups = groupByProject(entries)
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
        return matchingEntries.length > 0 ? { ...group, entries: matchingEntries } : null
      })
      .filter(Boolean) as ProjectGroup[]
  }, [groups, query])

  const copyToClipboard = useCallback(async () => {
    const text = buildPlainText(filteredGroups, monthLabel)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Report copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy — try selecting the text manually')
    }
  }, [groups, monthLabel])

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4 flex items-center gap-3 flex-wrap">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Monthly Report</h1>

        {/* Month navigation */}
        <div className="flex items-center gap-1 ml-4">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0"
            onClick={() => setMonthStart(m => addMonths(m, -1))} title="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[12rem] text-center">
            {monthLabel}
          </span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0"
            onClick={() => setMonthStart(m => addMonths(m, 1))} title="Next month"
            disabled={isCurrentMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button variant="outline" size="sm" className="h-7 ml-1"
            onClick={() => setMonthStart(getMonthStart(today))}>
            This Month
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {loading ? '' : entries.length === 0
              ? 'No entries'
              : query.trim()
                ? `${filteredGroups.reduce((n, g) => n + g.entries.length, 0)} of ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${filteredGroups.length} project${filteredGroups.length === 1 ? '' : 's'}`
                : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${groups.length} project${groups.length === 1 ? '' : 's'}`}
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

        {/* Journal entries for the month */}
        {(() => {
          const days = getMonthDates(monthStart, monthEnd)
            .map(d => ({ date: d, text: getJournalEntry(d) }))
            .filter(d => d.text.trim())
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
            <p className="text-sm">No work log entries for this month.</p>
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
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold">{group.projectName}</h2>
              <RagBadge status={group.ragStatus as RagStatus} />
            </div>
            {group.latestStatus && (
              <p className="text-sm text-muted-foreground mb-3 pl-0.5">
                <span className="font-medium text-foreground">Status:</span> {group.latestStatus}
              </p>
            )}

            <div className="border rounded-lg divide-y divide-border">
              {group.entries.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatEntryDate(entry.createdAt)} · {formatEntryTime(entry.createdAt)}
                  </p>
                  <WikiLinkContent>{entry.note}</WikiLinkContent>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
