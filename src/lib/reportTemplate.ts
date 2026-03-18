import type { Project, DropdownOption, WorkLogEntry, Task } from '@/types'
import { isOverdue } from '@/lib/utils'

const RAG_EMOJI: Record<string, string> = { Red: '🔴', Amber: '🟡', Green: '🟢' }

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

export interface TemplateRenderOpts {
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  allTasks: Task[]
  allWorkLog: WorkLogEntry[]
}

/** Replace {{token}} placeholders. Strips {{INSTRUCTIONS:...}} blocks. Leaves unknown tokens as-is. */
function tok(text: string, tokens: Record<string, string | number>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim()
    if (k in tokens) return String(tokens[k])
    if (k.startsWith('INSTRUCTIONS:')) return ''
    return match
  })
}

export function renderTemplate(
  rawTemplate: string,
  projects: Project[],
  opts: TemplateRenderOpts,
): string {
  const today = new Date().toLocaleDateString()
  const { priorities, productAreas, projectStatuses, allTasks, allWorkLog } = opts

  // ── Build lookup maps ─────────────────────────────────────────────────────
  const now = Date.now()
  const stalenessMap = new Map<number, number>()
  const latestLogMap = new Map<number, WorkLogEntry>()
  for (const entry of allWorkLog) {
    if (!stalenessMap.has(entry.projectId))
      stalenessMap.set(entry.projectId, Math.floor((now - new Date(entry.createdAt).getTime()) / 86_400_000))
    if (!latestLogMap.has(entry.projectId))
      latestLogMap.set(entry.projectId, entry)
  }

  const labelFor = (opts_: DropdownOption[], id: number | null) =>
    opts_.find(o => o.id === id)?.label ?? '—'

  // ── Parse template into sections ──────────────────────────────────────────
  // Split on level-2 headings (## ) to separate area block from summary block
  const l2Sections = rawTemplate.split(/\n(?=## )/)

  let preamble = ''
  let areaBlockRaw = ''
  let summaryBlockRaw = ''

  for (const section of l2Sections) {
    const heading = section.match(/^## (.+)/)?.[1]?.trim() ?? ''
    if (heading.includes('{{Area}}') || heading.includes('{{area}}')) {
      areaBlockRaw = section
    } else if (heading === 'Summary') {
      summaryBlockRaw = section
    } else {
      preamble += (preamble ? '\n' : '') + section
    }
  }

  // ── Parse area block: area header + project block ─────────────────────────
  const areaL3Parts = areaBlockRaw.split(/\n(?=### )/)
  const areaHeaderTemplate = areaL3Parts[0]             // "## {{Area}}\n..."
  const projectBlockTemplate = areaL3Parts.slice(1).join('\n') // "### {{workItem}}\n..."

  // ── Find task line within the project block ───────────────────────────────
  const projectLines = projectBlockTemplate.split('\n')
  const taskLineIdx = projectLines.findIndex(l => l.includes('{{taskTitle}}'))

  // ── Group projects by area (respecting productAreas sort order) ───────────
  type AreaGroup = { areaId: number | null; label: string; ps: Project[] }
  const areaGroups: AreaGroup[] = productAreas.map(a => ({ areaId: a.id, label: a.label, ps: [] }))
  const noAreaGroup: AreaGroup = { areaId: null, label: 'No Area', ps: [] }

  for (const p of projects) {
    const group = areaGroups.find(g => g.areaId === p.productAreaId) ?? noAreaGroup
    group.ps.push(p)
  }
  if (noAreaGroup.ps.length > 0) areaGroups.push(noAreaGroup)

  // ── Render preamble ───────────────────────────────────────────────────────
  let out = tok(preamble, { date: today }).trimEnd() + '\n'

  // ── Render each area ──────────────────────────────────────────────────────
  for (const group of areaGroups) {
    if (group.ps.length === 0) continue

    out += '\n' + tok(areaHeaderTemplate, { Area: group.label, area: group.label }).trimEnd() + '\n'

    for (const p of group.ps) {
      const latestLog = latestLogMap.get(p.id)
      const openTasks = allTasks.filter(t => t.projectId === p.id && t.status === 'open')
      const inProgressTasks = allTasks.filter(t => t.projectId === p.id && t.status === 'in_progress')
      const staleness = stalenessMap.get(p.id)

      const projectTokens: Record<string, string | number> = {
        workItem: p.workItem,
        RAG_EMOJI: RAG_EMOJI[p.ragStatus] ?? '',
        ragStatus: p.ragStatus,
        Status: labelFor(projectStatuses, p.statusId),
        projectStatus: labelFor(projectStatuses, p.statusId),
        Priority: labelFor(priorities, p.priorityId),
        priority: labelFor(priorities, p.priorityId),
        Area: group.label,
        area: group.label,
        dueDate: p.dueDate ? fmtDate(p.dueDate) : '—',
        latestStatus: p.latestStatus || '—',
        latestLogDate: latestLog ? fmtDate(latestLog.createdAt.slice(0, 10)) : '—',
        latestLogNote: latestLog ? latestLog.note.replace(/\n/g, ' ') : '—',
        openTaskCount: openTasks.length,
        inProgressTaskCount: inProgressTasks.length,
        '# of open Tasks': openTasks.length,
        '# of In Progress Tasks': inProgressTasks.length,
        '# days since last touched': staleness !== undefined ? `${staleness}d` : 'no log',
        daysSinceLastLog: staleness !== undefined ? staleness : 'no log',
        stakeholders: p.stakeholders.map(s => s.name).join(', ') || '—',
        linkedJiras: p.linkedJiras.map(j => j.label || j.url).join(', ') || '—',
        tasksHeader: (openTasks.length + inProgressTasks.length) > 0
          ? '| Task | Owner | Due | Status |\n|---|---|---|---|'
          : '',
      }

      let projectOut = ''
      for (let i = 0; i < projectLines.length; i++) {
        if (i === taskLineIdx) {
          // Expand task line once per open/in-progress task; skip line if no tasks
          const activeTasks = [...openTasks, ...inProgressTasks]
          for (const t of activeTasks) {
            projectOut += tok(projectLines[i], {
              ...projectTokens,
              taskTitle: t.title,
              taskOwner: t.owner || '—',
              taskDueDate: t.dueDate ? fmtDate(t.dueDate) : '—',
              taskStatus: t.status.replace('_', ' '),
            }) + '\n'
          }
        } else {
          projectOut += tok(projectLines[i], projectTokens) + '\n'
        }
      }
      out += projectOut
    }
  }

  // ── Render summary ────────────────────────────────────────────────────────
  if (summaryBlockRaw) {
    const ragCounts = { Red: 0, Amber: 0, Green: 0 }
    for (const p of projects) ragCounts[p.ragStatus]++
    const overdueTaskCount = allTasks.filter(t => t.status !== 'done' && isOverdue(t.dueDate)).length
    const staleCount = projects.filter(p => (stalenessMap.get(p.id) ?? Infinity) >= 14).length
    const noDueDateCount = projects.filter(p => !p.dueDate).length

    // Expand the "By Area" repeating line
    const areaLineTemplate = summaryBlockRaw.match(/^- \{\{area\}\}[^\n]*/m)?.[0] ?? ''
    const areaLines = areaGroups
      .filter(g => g.ps.length > 0)
      .map(g => tok(areaLineTemplate, {
        area: g.label,
        projectCount: g.ps.length,
        areaRed:   g.ps.filter(p => p.ragStatus === 'Red').length,
        areaAmber: g.ps.filter(p => p.ragStatus === 'Amber').length,
        areaGreen: g.ps.filter(p => p.ragStatus === 'Green').length,
      }))

    // Expand the "Red + Overdue" repeating line
    const overdueProjectIds = new Set(
      allTasks
        .filter(t => t.status !== 'done' && isOverdue(t.dueDate) && t.projectId !== null)
        .map(t => t.projectId!),
    )
    const redOverdueLineTemplate = summaryBlockRaw.match(/^- \{\{workItem\}\}[^\n]*/m)?.[0] ?? ''
    const redOverdueLines = projects
      .filter(p => p.ragStatus === 'Red' && overdueProjectIds.has(p.id))
      .map(p => tok(redOverdueLineTemplate, {
        workItem: p.workItem,
        overdueTaskCount: allTasks.filter(
          t => t.projectId === p.id && t.status !== 'done' && isOverdue(t.dueDate),
        ).length,
      }))

    let summaryOut = summaryBlockRaw
    if (areaLineTemplate)
      summaryOut = summaryOut.replace(areaLineTemplate, areaLines.join('\n') || '(none)')
    if (redOverdueLineTemplate)
      summaryOut = summaryOut.replace(redOverdueLineTemplate, redOverdueLines.join('\n') || '(none)')

    summaryOut = tok(summaryOut, {
      totalProjects: projects.length,
      redCount: ragCounts.Red,
      amberCount: ragCounts.Amber,
      greenCount: ragCounts.Green,
      overdueTaskCount,
      staleCount,
      noDueDateCount,
    })

    out += '\n' + summaryOut
  }

  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}
