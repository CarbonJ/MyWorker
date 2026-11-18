import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getJournalEntry, saveJournalEntry } from '@/db/journal'
import { getWorkLogByDate, type WorkLogEntryWithProject } from '@/db/workLog'
import { getNotebookPageByTitle, createNotebookPage, getLinkedNotebookEntriesByDateRange, type LinkedNotebookEntry } from '@/db/notebook'
import { getCompletedGeneralTasksByDate, type CompletedAreaTask } from '@/db/tasks'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { MarkdownField } from '@/components/MarkdownField'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { ChevronLeft, ChevronRight, CalendarDays, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportRangeTabs } from '@/components/ReportRangeTabs'
import { toLocalDateString } from '@/lib/utils'
import { combineStartedCompleted, type CombinedLogLine } from '@/lib/taskActivity'

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
  entries: CombinedLogLine<WorkLogEntryWithProject>[]
  notebooks: LinkedNotebookEntry[]
}

function mergeGroups(
  workLog: CombinedLogLine<WorkLogEntryWithProject>[],
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

interface AreaTaskGroup { key: string; areaName: string; tasks: CompletedAreaTask[] }

/** Group completed project-less tasks by their product area (rows already sorted by area). */
function groupByArea(tasks: CompletedAreaTask[]): AreaTaskGroup[] {
  const map = new Map<string, AreaTaskGroup>()
  for (const t of tasks) {
    const key = String(t.productAreaId ?? 'none')
    if (!map.has(key)) map.set(key, { key, areaName: t.areaName ?? 'No Area', tasks: [] })
    map.get(key)!.tasks.push(t)
  }
  return Array.from(map.values())
}

export default function DailyDigestView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const today = toLocalDateString(new Date())
  // ?date=YYYY-MM-DD opens a specific day (used by search results and the Tags screen)
  const [date, setDate] = useState(() => {
    const d = searchParams.get('date')
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today
  })
  const [entries, setEntries] = useState<WorkLogEntryWithProject[]>([])
  const [notebooks, setNotebooks] = useState<LinkedNotebookEntry[]>([])
  const [completedTasks, setCompletedTasks] = useState<CompletedAreaTask[]>([])
  const [loading, setLoading] = useState(true)
  const [meetings, setMeetings] = useState('')
  // Unsaved journal text, bound to the day it was typed for so a debounced save
  // can never land on a different day after the date changes.
  const pendingJournal = useRef<{ date: string; body: string } | null>(null)
  const journalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushJournal = useCallback(() => {
    if (journalTimer.current) clearTimeout(journalTimer.current)
    journalTimer.current = null
    const pending = pendingJournal.current
    pendingJournal.current = null
    if (pending) {
      saveJournalEntry(pending.date, pending.body)
        .catch(err => toast.error(`Failed to save journal: ${err instanceof Error ? err.message : String(err)}`))
    }
  }, [])

  // Save anything pending when leaving the page, or when the tab is hidden/closed
  useEffect(() => flushJournal, [flushJournal])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushJournal() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [flushJournal])
  // Entity list so resolved [[wiki links]] in the Journal render blue (live) vs muted (unlinked)
  const wikiEntities = useWikiEntities()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getWorkLogByDate(date),
      getLinkedNotebookEntriesByDateRange(date, date),
      getCompletedGeneralTasksByDate(date),
    ]).then(([wl, nb, ct]) => {
      setEntries(wl)
      setNotebooks(nb)
      setCompletedTasks(ct)
    }).finally(() => setLoading(false))
    // Save the previous day's pending text first, then load this day's entry
    flushJournal()
    let live = true
    setMeetings('')
    getJournalEntry(date).then(body => { if (live) setMeetings(body) }).catch(() => {})
    return () => { live = false }
  }, [date, flushJournal])

  const handleMeetingsChange = (v: string) => {
    setMeetings(v)
    pendingJournal.current = { date, body: v }
    if (journalTimer.current) clearTimeout(journalTimer.current)
    journalTimer.current = setTimeout(flushJournal, 600)
  }

  const handleWikiLinkClick = useCallback(async (name: string) => {
    let page = await getNotebookPageByTitle(name)
    if (!page) {
      const id = await createNotebookPage(name, '')
      page = { id, title: name, body: '', starred: false, createdAt: '', updatedAt: '' }
    }
    navigate(`/notebook?page=${page.id}`)
  }, [navigate])

  useEffect(() => {
    const handler = () => {
      if (date === today) {
        Promise.all([
          getWorkLogByDate(date),
          getLinkedNotebookEntriesByDateRange(date, date),
          getCompletedGeneralTasksByDate(date),
        ]).then(([wl, nb, ct]) => { setEntries(wl); setNotebooks(nb); setCompletedTasks(ct) }).catch(() => {})
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
  const groups = mergeGroups(combineStartedCompleted(entries), notebooks)
  const taskGroups = groupByArea(completedTasks)
  const hasActivity = entries.length > 0 || notebooks.length > 0 || completedTasks.length > 0
  const summary = [
    groups.length > 0 ? `${groups.length} project${groups.length === 1 ? '' : 's'}` : '',
    completedTasks.length > 0 ? `${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold">Daily Digest</h1>
        <ReportRangeTabs />
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
        <span className="ml-auto text-sm text-muted-foreground">
          {loading ? '' : !hasActivity ? 'No entries' : summary}
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
            wikiEntities={wikiEntities}
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
                    {entry.startedAt && `${formatTime(entry.startedAt)} – `}{formatTime(entry.createdAt)}
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

        {/* Completed tasks with no project — grouped by their area */}
        {!loading && taskGroups.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-2 text-foreground">Completed tasks (no project)</h2>
            <div className="border rounded-lg divide-y divide-border">
              {taskGroups.map(g => (
                <div key={g.key} className="px-4 py-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{g.areaName}</div>
                  <ul className="space-y-1">
                    {g.tasks.map(t => (
                      <li key={t.id} className="text-sm flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 shrink-0">✓</span>
                        <span>{t.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
