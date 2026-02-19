import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { searchProjectIds } from '@/db/search'
import type { Project, DropdownOption, RagStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type SortKey = 'workItem' | 'productArea' | 'priority' | 'ragStatus' | 'latestStatus' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

const COLOR_CLASS: Record<string, string> = {
  red:    'bg-red-100 text-red-700 border-red-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
  green:  'bg-green-100 text-green-700 border-green-200',
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
}

const DOT_CLASS: Record<string, string> = {
  red:    'bg-red-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  blue:   'bg-blue-500',
  purple: 'bg-purple-500',
}

function priorityClass(color: string): string {
  return COLOR_CLASS[color] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function priorityDot(color: string): string {
  return DOT_CLASS[color] ?? 'bg-slate-400'
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<DropdownOption[]>([])
  const [search, setSearch] = useState('')
  const [searchIds, setSearchIds] = useState<number[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [ragFilter, setRagFilter] = useState<RagStatus | 'All'>('All')
  const [priorityFilter, setPriorityFilter] = useState<string>('All')  // 'All' | priority id as string
  const [areaFilter, setAreaFilter] = useState<string>('All')          // 'All' | product_area id as string
  const [statusFilter, setStatusFilter] = useState<string>('All')      // 'All' | project_status id as string

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas, statuses] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
      setProjectStatuses(statuses)
    } catch (err) {
      console.error('Failed to load projects', err)
      toast.error(`Failed to load projects: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Full-text search — debounced 200ms
  useEffect(() => {
    if (!search.trim()) { setSearchIds(null); return }
    const t = setTimeout(async () => {
      const ids = await searchProjectIds(search)
      setSearchIds(ids)
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  const labelFor = (opts: DropdownOption[], id: number | null) =>
    opts.find(o => o.id === id)?.label ?? '—'

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    let list = [...projects]

    if (searchIds !== null) {
      const idSet = new Set(searchIds)
      list = list.filter(p => idSet.has(p.id))
      list.sort((a, b) => searchIds.indexOf(a.id) - searchIds.indexOf(b.id))
      return list
    }

    if (ragFilter !== 'All') list = list.filter(p => p.ragStatus === ragFilter)
    if (priorityFilter !== 'All') list = list.filter(p => String(p.priorityId ?? '') === priorityFilter)
    if (areaFilter !== 'All') list = list.filter(p => String(p.productAreaId ?? '') === areaFilter)
    if (statusFilter !== 'All') list = list.filter(p => String(p.statusId ?? '') === statusFilter)

    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'workItem': av = a.workItem.toLowerCase(); bv = b.workItem.toLowerCase(); break
        case 'productArea': av = labelFor(productAreas, a.productAreaId).toLowerCase(); bv = labelFor(productAreas, b.productAreaId).toLowerCase(); break
        case 'priority': av = labelFor(priorities, a.priorityId).toLowerCase(); bv = labelFor(priorities, b.priorityId).toLowerCase(); break
        case 'ragStatus': av = RAG_ORDER[a.ragStatus]; bv = RAG_ORDER[b.ragStatus]; break
        case 'latestStatus': av = a.latestStatus.toLowerCase(); bv = b.latestStatus.toLowerCase(); break
        case 'updatedAt': av = a.updatedAt; bv = b.updatedAt; break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [projects, searchIds, sortKey, sortDir, ragFilter, priorityFilter, areaFilter, statusFilter, priorities, productAreas, projectStatuses])

  const SortIcon = ({ col }: { col: SortKey }) =>
    <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0 flex-wrap">
        <Input
          placeholder="Search projects, tasks, work log…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {/* RAG filter */}
        <Select value={ragFilter} onValueChange={v => setRagFilter(v as RagStatus | 'All')}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="RAG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All RAG</SelectItem>
            <SelectItem value="Red">Red</SelectItem>
            <SelectItem value="Amber">Amber</SelectItem>
            <SelectItem value="Green">Green</SelectItem>
          </SelectContent>
        </Select>
        {/* Priority filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Priorities</SelectItem>
            {priorities.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${priorityDot(p.color)}`} />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Product Area filter */}
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Areas</SelectItem>
            {productAreas.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Project Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {projectStatuses.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => navigate('/projects/new')}>
          + New Project
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr>
              <th className={thClass} onClick={() => handleSort('workItem')}>Work Item<SortIcon col="workItem" /></th>
              <th className={thClass} onClick={() => handleSort('productArea')}>Product Area<SortIcon col="productArea" /></th>
              <th className={thClass} onClick={() => handleSort('priority')}>Priority<SortIcon col="priority" /></th>
              <th className={thClass} onClick={() => handleSort('ragStatus')}>RAG<SortIcon col="ragStatus" /></th>
              <th className={thClass}>Status</th>
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Latest Status<SortIcon col="latestStatus" /></th>
              <th className={thClass} onClick={() => handleSort('updatedAt')}>Updated<SortIcon col="updatedAt" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  {search ? 'No results found.' : 'No projects yet — create one to get started.'}
                </td>
              </tr>
            )}
            {sorted.map(p => (
              <tr
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="hover:bg-accent cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium">{p.workItem}</td>
                <td className="px-4 py-3 text-muted-foreground">{labelFor(productAreas, p.productAreaId)}</td>
                <td className="px-4 py-3">
                  {p.priorityId ? (() => {
                    const opt = priorities.find(o => o.id === p.priorityId)
                    const color = opt?.color ?? ''
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${priorityClass(color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityDot(color)}`} />
                        {opt?.label ?? '—'}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3"><RagBadge status={p.ragStatus} /></td>
                <td className="px-4 py-3">
                  {p.statusId ? (() => {
                    const opt = projectStatuses.find(s => s.id === p.statusId)
                    if (!opt) return <span className="text-muted-foreground">—</span>
                    const color = opt.color
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${priorityClass(color)}`}>
                        {color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot(color)}`} />}
                        {opt.label}
                      </span>
                    )
                  })() : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">{p.latestStatus || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(p.updatedAt + 'Z').toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
