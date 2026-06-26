import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWorkLogByDate, type WorkLogEntryWithProject } from '@/db/workLog'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ChevronLeft, ChevronRight, CalendarDays, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplayDate(dateStr: string): string {
  // Parse as local date to avoid timezone shift
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function groupByProject(entries: WorkLogEntryWithProject[]): { projectId: number; projectName: string; entries: WorkLogEntryWithProject[] }[] {
  const map = new Map<number, { projectId: number; projectName: string; entries: WorkLogEntryWithProject[] }>()
  for (const e of entries) {
    if (!map.has(e.projectId)) map.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, entries: [] })
    map.get(e.projectId)!.entries.push(e)
  }
  return Array.from(map.values())
}

export default function DailyDigestView() {
  const navigate = useNavigate()
  const today = toLocalDateString(new Date())
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<WorkLogEntryWithProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getWorkLogByDate(date)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [date])

  // Refresh when a task is completed via global modal — completing a task adds a work log entry
  useEffect(() => {
    const handler = () => {
      if (date === today) {
        getWorkLogByDate(date).then(setEntries).catch(() => {})
      }
    }
    window.addEventListener('myworker:task-saved', handler)
    return () => window.removeEventListener('myworker:task-saved', handler)
  }, [date, today])

  const shiftDay = (delta: number) => {
    const [y, m, d] = date.split('-').map(Number)
    const next = new Date(y, m - 1, d + delta)
    setDate(toLocalDateString(next))
  }

  const isToday = date === today
  const groups = groupByProject(entries)

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Daily Digest</h1>
        <div className="flex items-center gap-1 ml-4">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shiftDay(-1)} title="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[14rem] text-center">
            {formatDisplayDate(date)}
          </span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => shiftDay(1)} title="Next day" disabled={isToday}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isToday && (
          <Button variant="outline" size="sm" className="h-7 ml-1" onClick={() => setDate(today)}>
            Today
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground"
          onClick={() => navigate('/weekly')}>
          <FileText className="h-3.5 w-3.5" /> Weekly Report
        </Button>
        <span className="text-sm text-muted-foreground">
          {loading ? '' : entries.length === 0 ? 'No entries' : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} across ${groups.length} project${groups.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <CalendarDays className="h-8 w-8 opacity-30" />
            <p className="text-sm">No work log entries for this day.</p>
          </div>
        )}

        {!loading && groups.map(group => (
          <div key={group.projectId} className="mb-6">
            <button
              onClick={() => navigate(`/projects/${group.projectId}`)}
              className="text-sm font-semibold mb-2 hover:underline text-foreground flex items-center gap-1"
            >
              {group.projectName}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({group.entries.length})
              </span>
            </button>
            <div className="border rounded-lg divide-y divide-border">
              {group.entries.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {new Date(entry.createdAt.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <MarkdownContent>{entry.note}</MarkdownContent>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
