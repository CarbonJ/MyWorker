import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '@/contexts/SearchContext'
import { toast } from 'sonner'
import { getArchivedProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bookmark, X as XIcon } from 'lucide-react'
import { pillClass, pillClassActive, dotClass, RAG_ORDER } from '@/lib/colors'

type SortKey = 'workItem' | 'area' | 'rag' | 'priority' | 'status' | 'statusComment' | 'archived'
type SortEntry = { key: SortKey; dir: 'asc' | 'desc' }

interface SavedView {
  name: string
  ragFilters: RagStatus[]
  priorityFilters: string[]
  statusFilters: string[]
  areaFilters: string[]
  tagFilters: string[]
}

const LS = 'myworker:archive'
const LS_SAVED_VIEWS = `${LS}-saved-views`

function loadSavedViews(): SavedView[] {
  try { return JSON.parse(localStorage.getItem(LS_SAVED_VIEWS) ?? '[]') ?? [] }
  catch { return [] }
}
function persistSavedViews(views: SavedView[]) {
  localStorage.setItem(LS_SAVED_VIEWS, JSON.stringify(views))
}
function loadArr(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? [] }
  catch { return [] }
}
function loadSorted<T>(key: string, fallback: T[]): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}

const RAG_OPTIONS: { value: RagStatus; label: string; dotColor: string }[] = [
  { value: 'Green', label: 'Green', dotColor: 'bg-green-500' },
  { value: 'Amber', label: 'Amber', dotColor: 'bg-amber-400' },
  { value: 'Red',   label: 'Red',   dotColor: 'bg-red-500'   },
]

export default function ArchiveView() {
  const navigate = useNavigate()
  const { query } = useSearch()

  const [projects,        setProjects]        = useState<Project[]>([])
  const [priorities,      setPriorities]      = useState<DropdownOption[]>([])
  const [productAreas,    setProductAreas]    = useState<DropdownOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<DropdownOption[]>([])

  const [ragFilters,      setRagFilters]      = useState<RagStatus[]>(() => loadArr(`${LS}-rag`) as RagStatus[])
  const [priorityFilters, setPriorityFilters] = useState<string[]>(()   => loadArr(`${LS}-priority`))
  const [statusFilters,   setStatusFilters]   = useState<string[]>(()   => loadArr(`${LS}-status`))
  const [areaFilters,     setAreaFilters]     = useState<string[]>(()   => loadArr(`${LS}-area`))
  const [tagFilters,      setTagFilters]      = useState<string[]>(()   => loadArr(`${LS}-tags`))
  const [areaFilterButtons]                   = useState(() => localStorage.getItem('myworker:area-filter-buttons-projects') !== 'false')
  const [savedViews,      setSavedViews]      = useState<SavedView[]>(loadSavedViews)
  const [saveViewName,    setSaveViewName]    = useState('')
  const [saveViewOpen,    setSaveViewOpen]    = useState(false)

  const [sorts, setSorts] = useState<SortEntry[]>(() =>
    loadSorted<SortEntry>(`${LS}-sorts`, [{ key: 'archived', dir: 'desc' }])
  )

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas, statuses] = await Promise.all([
        getArchivedProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
      setProjectStatuses(statuses)
    } catch (err) {
      toast.error(`Failed to load archive: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Persist filter/sort state
  useEffect(() => { localStorage.setItem(`${LS}-rag`,      JSON.stringify(ragFilters))      }, [ragFilters])
  useEffect(() => { localStorage.setItem(`${LS}-priority`, JSON.stringify(priorityFilters)) }, [priorityFilters])
  useEffect(() => { localStorage.setItem(`${LS}-status`,   JSON.stringify(statusFilters))   }, [statusFilters])
  useEffect(() => { localStorage.setItem(`${LS}-area`,     JSON.stringify(areaFilters))     }, [areaFilters])
  useEffect(() => { localStorage.setItem(`${LS}-tags`,     JSON.stringify(tagFilters))      }, [tagFilters])
  useEffect(() => { localStorage.setItem(`${LS}-sorts`,    JSON.stringify(sorts))           }, [sorts])

  const allProjectTags = useMemo(() => {
    const s = new Set<string>()
    for (const p of projects) for (const t of p.tags) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [projects])

  const filteredProjects = useMemo(() => {
    let list = [...projects]

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(p =>
        p.workItem.toLowerCase().includes(q) ||
        p.latestStatus.toLowerCase().includes(q)
      )
    } else {
      if (ragFilters.length > 0)      list = list.filter(p => ragFilters.includes(p.ragStatus))
      if (priorityFilters.length > 0) list = list.filter(p => priorityFilters.includes(String(p.priorityId ?? '')))
      if (areaFilters.length > 0)     list = list.filter(p => areaFilters.includes(String(p.productAreaId ?? '')))
      if (statusFilters.length > 0)   list = list.filter(p => statusFilters.includes(String(p.statusId ?? '')))
      if (tagFilters.length > 0)      list = list.filter(p => tagFilters.some(tf => p.tags.some(t => t.toLowerCase() === tf.toLowerCase())))
    }

    list.sort((a, b) => {
      for (const { key, dir } of sorts) {
        let av: string | number = '', bv: string | number = ''
        switch (key) {
          case 'workItem':      av = a.workItem.toLowerCase();     bv = b.workItem.toLowerCase();     break
          case 'area':
            av = productAreas.find(o => o.id === a.productAreaId)?.sortOrder ?? 999
            bv = productAreas.find(o => o.id === b.productAreaId)?.sortOrder ?? 999; break
          case 'rag':           av = RAG_ORDER[a.ragStatus];       bv = RAG_ORDER[b.ragStatus];       break
          case 'priority':
            av = priorities.find(o => o.id === a.priorityId)?.sortOrder ?? 999
            bv = priorities.find(o => o.id === b.priorityId)?.sortOrder ?? 999; break
          case 'status':
            av = projectStatuses.find(o => o.id === a.statusId)?.sortOrder ?? 999
            bv = projectStatuses.find(o => o.id === b.statusId)?.sortOrder ?? 999; break
          case 'statusComment': av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
          case 'archived':      av = a.updatedAt;                  bv = b.updatedAt;                  break
        }
        if (av < bv) return dir === 'asc' ? -1 : 1
        if (av > bv) return dir === 'asc' ? 1 : -1
      }
      return 0
    })

    return list
  }, [projects, query, ragFilters, priorityFilters, areaFilters, statusFilters, tagFilters, sorts, priorities, productAreas, projectStatuses])

  const handleSort = (col: SortKey) => {
    setSorts(prev => {
      const existing = prev.find(s => s.key === col)
      if (!existing) return [...prev, { key: col, dir: 'asc' }]
      if (existing.dir === 'asc') return prev.map(s => s.key === col ? { ...s, dir: 'desc' as const } : s)
      return prev.filter(s => s.key !== col)
    })
  }

  const hasActiveFilters = ragFilters.length > 0 || priorityFilters.length > 0 || areaFilters.length > 0 || statusFilters.length > 0 || tagFilters.length > 0

  const saveCurrentView = () => {
    const name = saveViewName.trim()
    if (!name) return
    const view: SavedView = { name, ragFilters, priorityFilters, statusFilters, areaFilters, tagFilters }
    const updated = [...savedViews.filter(v => v.name !== name), view]
    setSavedViews(updated)
    persistSavedViews(updated)
    setSaveViewName('')
    setSaveViewOpen(false)
    toast.success(`View "${name}" saved`)
  }

  const applyView  = (view: SavedView) => {
    setRagFilters(view.ragFilters); setPriorityFilters(view.priorityFilters)
    setStatusFilters(view.statusFilters); setAreaFilters(view.areaFilters); setTagFilters(view.tagFilters)
  }
  const deleteView = (name: string) => {
    const updated = savedViews.filter(v => v.name !== name)
    setSavedViews(updated); persistSavedViews(updated)
  }

  const ragOptions      = RAG_OPTIONS.map(o => ({ value: o.value, label: o.label, prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} /> }))
  const priorityOptions = priorities.map(p => ({ value: String(p.id), label: p.label, prefix: <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(p.color)}`} /> }))
  const statusOptions   = projectStatuses.map(s => ({ value: String(s.id), label: s.label, prefix: s.color ? <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(s.color)}`} /> : undefined }))

  const SortInd = ({ col }: { col: SortKey }) => {
    const idx = sorts.findIndex(s => s.key === col)
    if (idx === -1) return <span className="ml-1 opacity-30">↕</span>
    const { dir } = sorts[idx]
    return (
      <span className={`ml-1 ${dir === 'asc' ? 'text-blue-700 dark:text-blue-400' : 'text-green-700 dark:text-green-500'}`}>
        {sorts.length > 1 ? <sup className="text-[9px] mr-px">{idx + 1}</sup> : null}{dir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const thBase = 'border-b bg-background text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none cursor-pointer hover:text-foreground transition-colors px-4 py-2 whitespace-nowrap'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">

      {/* ── Toolbar row 1 — filters ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0 flex-wrap">
        <h1 className="text-lg font-semibold mr-1">Archive</h1>

        <MultiSelectFilter options={ragOptions} value={ragFilters} onChange={v => setRagFilters(v as RagStatus[])} placeholder="All RAG" width="w-28" />
        <MultiSelectFilter options={priorityOptions} value={priorityFilters} onChange={setPriorityFilters} placeholder="All Priorities" width="w-36" />
        <MultiSelectFilter options={statusOptions} value={statusFilters} onChange={setStatusFilters} placeholder="All Statuses" width="w-36" />
        <MultiSelectFilter
          options={allProjectTags.map(t => ({ value: t, label: t }))}
          value={tagFilters} onChange={setTagFilters}
          placeholder="All Tags" width="w-32" searchable
        />

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setRagFilters([]); setPriorityFilters([]); setAreaFilters([]); setStatusFilters([]); setTagFilters([]) }}>
            ✕ Reset filters
          </Button>
        )}

        <Popover open={saveViewOpen} onOpenChange={setSaveViewOpen}>
          <PopoverTrigger asChild>
            <button className="h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded-md hover:bg-accent transition-colors" title="Save current filters as a named view">
              <Bookmark className="h-3.5 w-3.5" />Save view
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <p className="text-xs font-medium mb-2">Name this view</p>
            <div className="flex gap-1.5">
              <Input value={saveViewName} onChange={e => setSaveViewName(e.target.value)} placeholder="e.g. Red + Platform"
                className="h-7 text-xs flex-1" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); if (e.key === 'Escape') setSaveViewOpen(false) }} />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={saveCurrentView} disabled={!saveViewName.trim()}>Save</Button>
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-sm text-muted-foreground ml-auto">{filteredProjects.length} archived project{filteredProjects.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Toolbar row 2 — Area filter ── */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-background shrink-0">
        <span className="text-xs text-muted-foreground font-medium mr-1">Area:</span>
        {areaFilterButtons ? (
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { value: 'All', label: 'All Areas', color: '' },
              ...productAreas.map(a => ({ value: String(a.id), label: a.label, color: a.color })),
            ].map(opt => {
              const isAll = opt.value === 'All'
              const isActive = isAll ? areaFilters.length === 0 : areaFilters.includes(opt.value)
              const anyActive = areaFilters.length > 0
              const coloredClass = isActive
                ? (opt.color ? pillClassActive(opt.color) : 'bg-primary text-primary-foreground border-primary')
                : anyActive && !isAll
                  ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  : (opt.color ? pillClass(opt.color) : 'border-input bg-background hover:bg-accent hover:text-accent-foreground')
              return (
                <button key={opt.value}
                  onClick={() => isAll ? setAreaFilters([]) : setAreaFilters(prev => prev.length === 1 && prev[0] === opt.value ? [] : [opt.value])}
                  className={`h-7 px-2.5 text-xs rounded-full border transition-colors ${coloredClass}`}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        ) : (
          <MultiSelectFilter
            options={productAreas.map(a => ({ value: String(a.id), label: a.label }))}
            value={areaFilters} onChange={setAreaFilters} placeholder="All Areas" width="w-40"
          />
        )}
      </div>

      {/* ── Toolbar row 3 — Saved views ── */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-1.5 px-6 py-1.5 border-b bg-background shrink-0 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Views:</span>
          {savedViews.map(view => (
            <div key={view.name} className="flex items-center gap-0 border rounded-full overflow-hidden h-6">
              <button onClick={() => applyView(view)} className="px-2.5 text-xs hover:bg-accent transition-colors h-full" title={`Apply view: ${view.name}`}>
                {view.name}
              </button>
              <button onClick={() => deleteView(view.name)} className="pr-1.5 pl-0.5 text-muted-foreground hover:text-destructive transition-colors h-full flex items-center" title={`Delete view "${view.name}"`}>
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 bg-background z-10">
            <tr>
              <th className={thBase} onClick={() => handleSort('workItem')}>Work Item<SortInd col="workItem" /></th>
              <th className={thBase} onClick={() => handleSort('area')}>Area<SortInd col="area" /></th>
              <th className={thBase} onClick={() => handleSort('priority')}>Priority<SortInd col="priority" /></th>
              <th className={thBase} onClick={() => handleSort('rag')}>RAG<SortInd col="rag" /></th>
              <th className={thBase} onClick={() => handleSort('status')}>Status<SortInd col="status" /></th>
              <th className={thBase} onClick={() => handleSort('statusComment')}>Latest Status<SortInd col="statusComment" /></th>
              <th className={thBase} onClick={() => handleSort('archived')}>Archived<SortInd col="archived" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredProjects.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  {query || hasActiveFilters ? 'No results match the current filters.' : 'No archived projects yet. Mark a project complete to archive it.'}
                </td>
              </tr>
            )}
            {filteredProjects.map(p => {
              const priorityOpt  = priorities.find(o => o.id === p.priorityId)
              const statusOpt    = projectStatuses.find(o => o.id === p.statusId)
              return (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  className="hover:bg-accent cursor-pointer transition-colors opacity-75 hover:opacity-100">
                  <td className="px-4 py-3 font-medium text-muted-foreground">{p.workItem}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {productAreas.find(o => o.id === p.productAreaId)?.label ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {priorityOpt ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(priorityOpt.color)}`}>
                        {priorityOpt.color && <span className={`w-1.5 h-1.5 rounded-full ${dotClass(priorityOpt.color)}`} />}
                        {priorityOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3"><RagBadge status={p.ragStatus as RagStatus} /></td>
                  <td className="px-4 py-3">
                    {statusOpt ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${pillClass(statusOpt.color)}`}>
                        {statusOpt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(statusOpt.color)}`} />}
                        {statusOpt.label}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">{p.latestStatus || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(p.updatedAt + 'Z').toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
