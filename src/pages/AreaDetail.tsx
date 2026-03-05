import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAllProjects } from '@/db/projects'
import { getAllTasks } from '@/db/tasks'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, Task, DropdownOption, TaskStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { useDataLoader } from '@/hooks/useDataLoader'
import { pillClass, dotClass } from '@/lib/colors'
import { fmtDate, isOverdue, isDueToday } from '@/lib/utils'

interface PageData {
  projects: Project[]
  tasks: Task[]
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
}

function StatusDot({ status }: { status: TaskStatus }) {
  if (status === 'done') return (
    <span className="w-4 h-4 rounded-sm bg-green-500 border-2 border-green-500 flex items-center justify-center text-white text-[9px] font-bold leading-none shrink-0">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-4 h-4 rounded-sm border-2 border-blue-500 flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-sm bg-blue-500" />
    </span>
  )
  return <span className="w-4 h-4 rounded-sm border-2 border-slate-300 shrink-0" />
}

export default function AreaDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const areaId = Number(id)

  const { data } = useDataLoader<PageData>(
    async () => {
      const [projects, tasks, priorities, productAreas] = await Promise.all([
        getAllProjects(),
        getAllTasks(),
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      return { projects, tasks, priorities, productAreas }
    },
    'Failed to load area',
  )

  const projects     = data?.projects     ?? []
  const tasks        = data?.tasks        ?? []
  const priorities   = data?.priorities   ?? []
  const productAreas = data?.productAreas ?? []

  const area = productAreas.find(a => a.id === areaId)

  // Projects belonging to this area
  const areaProjects = useMemo(
    () => projects.filter(p => p.productAreaId === areaId),
    [projects, areaId],
  )

  const areaProjectIds = useMemo(
    () => new Set(areaProjects.map(p => p.id)),
    [areaProjects],
  )

  // Non-done tasks whose effective area is this area
  const openTasks = useMemo(
    () => tasks.filter(t => {
      if (t.status === 'done') return false
      // Project task: area inherited from project
      if (t.projectId !== null) return areaProjectIds.has(t.projectId)
      // Loose task: directly assigned to this area
      return t.productAreaId === areaId
    }),
    [tasks, areaId, areaProjectIds],
  )

  // Group open tasks: by project, then loose tasks last
  const taskGroups = useMemo(() => {
    const byProject = new Map<number, Task[]>()
    const loose: Task[] = []
    for (const t of openTasks) {
      if (t.projectId !== null) {
        const arr = byProject.get(t.projectId) ?? []
        arr.push(t)
        byProject.set(t.projectId, arr)
      } else {
        loose.push(t)
      }
    }
    // Build ordered list: projects that have tasks, in areaProjects order
    const groups: Array<{ project: Project | null; tasks: Task[] }> = []
    for (const p of areaProjects) {
      const pts = byProject.get(p.id)
      if (pts && pts.length > 0) groups.push({ project: p, tasks: pts })
    }
    if (loose.length > 0) groups.push({ project: null, tasks: loose })
    return groups
  }, [openTasks, areaProjects])

  if (data && !area) {
    return (
      <div className="flex flex-col h-[calc(100vh-57px)] items-center justify-center gap-4">
        <p className="text-muted-foreground">Area not found.</p>
        <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
          ← Back to Projects
        </button>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const color = area?.color ?? ''

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ← Projects
          </button>
          <span className="text-muted-foreground">/</span>
          {area && <span className={`w-3 h-3 rounded-full shrink-0 ${dotClass(color)}`} />}
          <h1 className="text-xl font-semibold">{area?.label ?? '…'}</h1>
          <div className="flex items-center gap-4 ml-auto text-xs text-muted-foreground">
            <span>{areaProjects.length} project{areaProjects.length !== 1 ? 's' : ''}</span>
            <span>{openTasks.length} open task{openTasks.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* ── Projects ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Projects ({areaProjects.length})
          </h2>
          {areaProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No projects in this area.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Item</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">RAG</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {areaProjects.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="hover:bg-accent cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2 font-medium">
                        <span className="flex items-center gap-2">
                          {p.workItem}
                          {p.dueDate && p.dueDate < today && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 shrink-0">
                              🗓 Overdue
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {p.priorityId ? (() => {
                          const opt = priorities.find(o => o.id === p.priorityId)
                          const c = opt?.color ?? ''
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${pillClass(c)}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotClass(c)}`} />
                              {opt?.label ?? '—'}
                            </span>
                          )
                        })() : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2"><RagBadge status={p.ragStatus} /></td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[24rem]">
                        <span className="line-clamp-2">{p.latestStatus || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Open Tasks ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Open Tasks ({openTasks.length})
          </h2>
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No open tasks in this area.</p>
          ) : (
            <div className="space-y-4">
              {taskGroups.map(({ project, tasks: groupTasks }) => (
                <div key={project?.id ?? '__loose__'} className="border rounded-md overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
                    {project ? (
                      <button
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="text-sm font-medium hover:underline underline-offset-2 text-left"
                      >
                        {project.workItem}
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground italic">Loose Tasks (no project)</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({groupTasks.length})
                    </span>
                  </div>
                  {/* Task rows */}
                  <div className="divide-y divide-border/60">
                    {groupTasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors">
                        <StatusDot status={t.status} />
                        <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                          {t.title}
                        </span>
                        {t.dueDate && (
                          <span className={`text-xs shrink-0 ${
                            isOverdue(t.dueDate) ? 'text-red-600 font-medium' :
                            isDueToday(t.dueDate) ? 'text-amber-600 font-medium' :
                            'text-muted-foreground'
                          }`}>
                            {fmtDate(t.dueDate)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
