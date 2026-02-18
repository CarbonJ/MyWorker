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

type SortKey = 'workItem' | 'productArea' | 'priority' | 'ragStatus' | 'latestStatus' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const RAG_ORDER: Record<RagStatus, number> = { Red: 0, Amber: 1, Green: 2 }

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])
  const [search, setSearch] = useState('')
  const [searchIds, setSearchIds] = useState<number[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [ragFilter, setRagFilter] = useState<RagStatus | 'All'>('All')

  const load = useCallback(async () => {
    try {
      const [ps, pris, areas] = await Promise.all([
        getAllProjects(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      setProjects(ps)
      setPriorities(pris)
      setProductAreas(areas)
    } catch {
      toast.error('Failed to load projects')
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
  }, [projects, searchIds, sortKey, sortDir, ragFilter, priorities, productAreas])

  const SortIcon = ({ col }: { col: SortKey }) =>
    <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap'

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-background shrink-0">
        <Input
          placeholder="Search projects, tasks, work log…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1 ml-2">
          {(['All', 'Red', 'Amber', 'Green'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRagFilter(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                ragFilter === r
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
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
              <th className={thClass} onClick={() => handleSort('latestStatus')}>Latest Status<SortIcon col="latestStatus" /></th>
              <th className={thClass} onClick={() => handleSort('updatedAt')}>Updated<SortIcon col="updatedAt" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
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
                <td className="px-4 py-3 text-muted-foreground">{labelFor(priorities, p.priorityId)}</td>
                <td className="px-4 py-3"><RagBadge status={p.ragStatus} /></td>
                <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">{p.latestStatus || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
