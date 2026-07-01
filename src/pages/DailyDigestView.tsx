import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWorkLogByDate, type WorkLogEntryWithProject } from '@/db/workLog'
import { getNotebookPageByTitle, createNotebookPage, getLinkedNotebookEntriesByDateRange, type LinkedNotebookEntry } from '@/db/notebook'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { MarkdownField } from '@/components/MarkdownField'
import { ChevronLeft, ChevronRight, CalendarDays, FileText, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(ts: string): string {
  return new Date(ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface ProjectGroup {
  projectId: number
  projectName: string
  entries: WorkLogEntryWithProject[]
  notebooks: LinkedNotebookEntry[]
}

function mergeGroups(
  workLog: WorkLogEntryWithProject[],
  notebooks: LinkedNotebookEntry[],
): ProjectGroup[] {
  const map = new Map<number, ProjectGroup>()
  for (const e of workLog) {
    if (!map.has(e.projectId)) map.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, entries: [], notebooks: [] })
    map.get(e.projectId)!.entries.push(e)
  }
  for (const n of notebooks) {
    if (!map.has(n.projectId)) map.set(n.projectId, { projectId: n.projectId, projectName: n.projectName, entries: [], notebooks: [] })
    map.get(n.projectId)!.notebooks.push(n)
  }
  return Array.from(map.values())
}

const MEETINGS_KEY = (date: string) => `myworker:digest-meetings:${date}`

export default function DailyDigestView() {
  const navigate = useNavigate()
  const today = toLocalDateString(new Date())
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<WorkLogEntryWithProject[]>([])
  const [notebooks, setNotebooks] = useState<LinkedNotebookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [meetings, setMeetings] = useState(() => localStorage.getItem(MEETINGS_KEY(toLocalDateString(new Date()))) ?? '')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getWorkLogByDate(date),
      getLinkedNotebookEntriesByDateRange(date, date),
    ]).then(([wl, nb]) => {
      setEntries(wl)
      setNotebooks(nb)
    }).finally(() => setLoading(false))
    setMeetings(localStorage.getItem(MEETINGS_KEY(date)) ?? '')
  }, [date])

  const handleMeetingsChange = (v: string) => {
    setMeetings(v)
    localStorage.setItem(MEETINGS_KEY(date), v)
  }

  const handleWikiLinkClick = useCallback(async (name: string) => {
    let page = await getNotebookPageByTitle(name)
    if (!page) {
      const id = await createNotebookPage(name, '')
      page = { id, title: name, body: '', createdAt: '', updatedAt: '' }
    }
    navigate(`/notebook?page=${page.id}`)
  }, [navigate])

  useEffect(() => {
    const handler = () => {
      if (date === today) {
        Promise.all([
          getWorkLogByDate(date),
          getLinkedNotebookEntriesByDateRange(date, date),
        ]).then(([wl, nb]) => { setEntries(wl); setNotebooks(nb) }).catch(() => {})
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
  const groups = mergeGroups(entries, notebooks)
  const hasActivity = entries.length > 0 || notebooks.length > 0

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
          {loading ? '' : !hasActivity ? 'No entries' : `${groups.length} project${groups.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">

        {/* Journal */}
        <div className="mb-6">
          <MarkdownField
            id={`digest-meetings-${date}`}
            label="Journal"
            value={meetings}
            onChange={handleMeetingsChange}
            placeholder="Today's meetings… use [[ to link to a note"
            autoHeight
            expandable
            enableWikiLinks
            onWikiLinkClick={handleWikiLinkClick}
          />
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && !hasActivity && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <CalendarDays className="h-8 w-8 opacity-30" />
            <p className="text-sm">No entries for this day.</p>
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
                ({group.entries.length + group.notebooks.length})
              </span>
            </button>
            <div className="border rounded-lg divide-y divide-border">
              {group.entries.map(entry => (
                <div key={`wl-${entry.id}`} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatTime(entry.createdAt)}
                  </p>
                  <WikiLinkContent>{entry.note}</WikiLinkContent>
                </div>
              ))}
              {group.notebooks.map(nb => (
                <div key={`nb-${nb.pageId}`} className="px-4 py-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {formatTime(nb.updatedAt)}
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
