import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, FolderKanban, CheckSquare, ScrollText, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { searchEnriched } from '@/db/search'
import { parseSearchQuery, SNIPPET_MARK_START, SNIPPET_MARK_END } from '@/lib/searchQuery'
import { dotClass, RAG_COLOR } from '@/lib/colors'
import { RagBadge } from '@/components/RagBadge'
import type { EnrichedSearchResult, SearchSourceType } from '@/db/search'
import type { RagStatus } from '@/types'

const TASK_STATUS_LABEL: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  done:        'Done',
}

function formatTs(ts: string): string {
  try {
    return new Date(ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleString()
  } catch {
    return ts
  }
}

// Render a plain-text snippet from FTS5 snippet(). Matched terms are wrapped
// in sentinel characters (not HTML) and rendered as React <mark> elements, so
// HTML stored in notes/tasks/projects is displayed as text, never executed.
function Snippet({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const segments = text.split(SNIPPET_MARK_START)
  nodes.push(segments[0])
  for (let i = 1; i < segments.length; i++) {
    const endIdx = segments[i].indexOf(SNIPPET_MARK_END)
    if (endIdx === -1) {
      nodes.push(segments[i])
      continue
    }
    nodes.push(
      <mark key={i} className="bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-200 rounded-sm px-0.5">
        {segments[i].slice(0, endIdx)}
      </mark>,
    )
    nodes.push(segments[i].slice(endIdx + 1))
  }
  return (
    <span className="text-xs text-muted-foreground leading-relaxed">
      {nodes}
    </span>
  )
}

type ScopeFilter = 'all' | SearchSourceType

interface GroupState {
  projects: boolean
  task: boolean
  work_log: boolean
  notebook: boolean
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Seed from ?q= so the nav-bar search (or a shared link) can jump straight to results
  const [input, setInput] = useState(() => searchParams.get('q') ?? '')
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [taskStatuses, setTaskStatuses] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('myworker:search-task-status') ?? 'null')
      return Array.isArray(saved) ? saved : ['open', 'in_progress']
    } catch { return ['open', 'in_progress'] }
  })
  const [results, setResults] = useState<EnrichedSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<GroupState>({ projects: false, task: false, work_log: false, notebook: false })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Persist task-status filter
  useEffect(() => {
    localStorage.setItem('myworker:search-task-status', JSON.stringify(taskStatuses))
  }, [taskStatuses])

  // Debounce input → query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(input), 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [input])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) { setResults([]); return }
    const { include } = parseSearchQuery(q)
    if (include.length === 0) { setResults([]); return }

    const types: SearchSourceType[] | undefined =
      scope === 'all' ? undefined : [scope]

    setLoading(true)
    try {
      const r = await searchEnriched(q, types)
      setResults(r)
    } catch (err) {
      console.error('[search]', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, scope])

  useEffect(() => { runSearch() }, [runSearch])

  const projects  = results.filter(r => r.sourceType === 'project')
  const tasks     = results.filter(r =>
    r.sourceType === 'task' && (!r.taskStatus || taskStatuses.includes(r.taskStatus)))
  const workLog   = results.filter(r => r.sourceType === 'work_log')
  const notebooks = results.filter(r => r.sourceType === 'notebook')

  const toggleGroup = (key: keyof GroupState) =>
    setCollapsed(s => ({ ...s, [key]: !s[key] }))

  const scopeBtn = (label: string, value: ScopeFilter, count?: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setScope(value)}
      className={`h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
        scope === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-input text-muted-foreground hover:text-foreground hover:border-foreground/40'
      }`}
    >
      {label}{count !== undefined && query ? ` (${count})` : ''}
    </button>
  )

  const hasQuery = query.trim().length > 0
  const hasResults = results.length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Search header */}
      <div className="border-b bg-background px-6 py-4 space-y-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Search projects, tasks, work log…"
            className="pl-9 h-10 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Multiple terms are ANDed: <code className="bg-muted px-1 rounded">dog bowl</code>
          {' '}·{' '}
          Exclude with NOT: <code className="bg-muted px-1 rounded">dog bowl NOT cat</code>
          {' '}or{' '}
          <code className="bg-muted px-1 rounded">dog bowl -cat</code>
        </p>
        {/* Source scope + task-status filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {scopeBtn('All', 'all', hasResults ? results.length : undefined)}
          {scopeBtn('Projects', 'project', projects.length)}
          {scopeBtn('Tasks', 'task', tasks.length)}
          {scopeBtn('Work Log', 'work_log', workLog.length)}
          {scopeBtn('Notebook', 'notebook', notebooks.length)}
          {(scope === 'all' || scope === 'task') && (
            <MultiSelectFilter
              options={[
                { value: 'open',        label: 'Open' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'done',        label: 'Done' },
              ]}
              value={taskStatuses}
              onChange={setTaskStatuses}
              placeholder="Task Status"
              triggerLabel="Tasks"
              width="w-24"
            />
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!hasQuery && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Search className="h-10 w-10 opacity-20" />
            <p className="text-sm">Type to search across all your projects, tasks and work log</p>
          </div>
        )}

        {hasQuery && !loading && !hasResults && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No results for <strong>{query}</strong></p>
          </div>
        )}

        {hasQuery && hasResults && (
          <div className="divide-y divide-border">
            {/* Projects group */}
            {(scope === 'all' || scope === 'project') && projects.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleGroup('projects')}
                  className="w-full flex items-center gap-2 px-6 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {collapsed.projects ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projects</span>
                  <span className="text-xs text-muted-foreground ml-1">({projects.length})</span>
                </button>
                {!collapsed.projects && (
                  <div className="divide-y divide-border/50">
                    {projects.map(r => (
                      <Link
                        key={`proj-${r.sourceId}`}
                        to={`/projects/${r.sourceId}`}
                        className="flex items-start gap-3 px-6 py-3 hover:bg-accent/50 transition-colors group"
                      >
                        <div className="mt-0.5 shrink-0">
                          {r.ragStatus && (
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass(RAG_COLOR[r.ragStatus as RagStatus])}`} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">{r.title}</span>
                            {r.ragStatus && (
                              <RagBadge status={r.ragStatus as RagStatus} />
                            )}
                            {r.areaLabel && (
                              <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{r.areaLabel}</span>
                            )}
                          </div>
                          <Snippet text={r.snippet} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tasks group */}
            {(scope === 'all' || scope === 'task') && tasks.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleGroup('task')}
                  className="w-full flex items-center gap-2 px-6 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {collapsed.task ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tasks</span>
                  <span className="text-xs text-muted-foreground ml-1">({tasks.length})</span>
                </button>
                {!collapsed.task && (
                  <div className="divide-y divide-border/50">
                    {tasks.map(r => (
                      <Link
                        key={`task-${r.sourceId}`}
                        to={r.projectId ? `/projects/${r.projectId}?task=${r.sourceId}` : `/?task=${r.sourceId}`}
                        className="flex items-start gap-3 px-6 py-3 hover:bg-accent/50 transition-colors group"
                      >
                        <CheckSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">{r.title}</span>
                            {r.taskStatus && (
                              <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                                {TASK_STATUS_LABEL[r.taskStatus] ?? r.taskStatus}
                              </span>
                            )}
                          </div>
                          {r.projectName && (
                            <p className="text-xs text-muted-foreground">in {r.projectName}</p>
                          )}
                          <Snippet text={r.snippet} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Work Log group */}
            {(scope === 'all' || scope === 'work_log') && workLog.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleGroup('work_log')}
                  className="w-full flex items-center gap-2 px-6 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {collapsed.work_log ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Log</span>
                  <span className="text-xs text-muted-foreground ml-1">({workLog.length})</span>
                </button>
                {!collapsed.work_log && (
                  <div className="divide-y divide-border/50">
                    {workLog.map(r => (
                      <Link
                        key={`wl-${r.sourceId}`}
                        to={`/projects/${r.projectId}`}
                        className="flex items-start gap-3 px-6 py-3 hover:bg-accent/50 transition-colors group"
                      >
                        <ScrollText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.projectName && (
                              <span className="text-sm font-medium group-hover:text-primary transition-colors">{r.projectName}</span>
                            )}
                            {r.entryCreatedAt && (
                              <span className="text-xs text-muted-foreground">{formatTs(r.entryCreatedAt)}</span>
                            )}
                          </div>
                          <Snippet text={r.snippet} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notebook group */}
            {(scope === 'all' || scope === 'notebook') && notebooks.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleGroup('notebook')}
                  className="w-full flex items-center gap-2 px-6 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {collapsed.notebook ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notebook</span>
                  <span className="text-xs text-muted-foreground ml-1">({notebooks.length})</span>
                </button>
                {!collapsed.notebook && (
                  <div className="divide-y divide-border/50">
                    {notebooks.map(r => (
                      <button
                        key={`nb-${r.sourceId}`}
                        type="button"
                        onClick={() => navigate(`/notebook?page=${r.sourceId}`)}
                        className="w-full flex items-start gap-3 px-6 py-3 hover:bg-accent/50 transition-colors group text-left"
                      >
                        <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <span className="text-sm font-medium group-hover:text-primary transition-colors block">{r.title || 'Untitled'}</span>
                          <Snippet text={r.snippet} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
