/**
 * Markdown mirror — the whole data set as a folder of readable .md files, so a
 * plain-text copy exists outside the app (and opens as an Obsidian vault).
 *
 * Pure: takes the backup snapshot (snapshotUserData() rows, snake_case
 * columns) and returns file path → content. db/markdownMirror.ts writes it to
 * the storage folder once a day.
 *
 * Layout (paths relative to the mirror folder):
 *   README.md
 *   Projects/<name>.md            active projects: fields, tasks, work log
 *   Projects/Archived/<name>.md   completed projects
 *   Areas/<area>.md               the area's projects and project-less tasks
 *   Inbox.md                      tasks with no project or area
 *   Notes/<title>.md
 *   Contacts/<name>.md
 *   Journal/<YYYY-MM-DD>.md
 *
 * Fields go in YAML front matter. Tasks use Obsidian Tasks syntax (📅 due,
 * 🛫 start, ✅ done, [/] in progress), which still reads fine as plain text.
 * [[Links]] and #tags are left as written — both apps use the same syntax. A
 * file whose name had to change (characters a file name or link can't hold)
 * lists the real name under `aliases`, so links to it still resolve.
 * Images point at the assets folder next to the mirror. Trash is left out.
 */

import { parseAssetSrc } from '@/db/assets'
import { cleanMarkdownExport } from './noteExport'
import { parseTags } from './tags'

type Row = Record<string, unknown>

export const MIRROR_FOLDER = 'MyWorkerMarkdown'

export interface MirrorOptions {
  /** Assets subfolder name, next to the mirror folder in the storage folder. */
  assetsFolder: string
  /** Local date (YYYY-MM-DD) the mirror is written, shown in the README. */
  today: string
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const rows = (data: Row, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : [])

/**
 * A file name that works on Windows, macOS and OneDrive and inside a [[link]]:
 * no path or wildcard characters, no link syntax (# ^ [ ] |), no leading dot
 * and no trailing dot or space.
 */
export function mirrorFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>#^[\]]/g, '-')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
  return cleaned.slice(0, 120) || 'Untitled'
}

/** "2026-11-24 14:03:00" (UTC, as SQLite stores it) → local "2026-11-24 14:03". */
export function localStamp(utc: string): string {
  if (!utc) return ''
  const d = new Date(`${utc.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(utc) ? '' : 'Z'}`)
  if (Number.isNaN(d.getTime())) return utc
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** YAML front matter. Strings are JSON-quoted (valid YAML); empty values are left out. */
function frontMatter(fields: [string, string | number | boolean | string[] | null | undefined][]): string {
  const lines: string[] = []
  for (const [key, value] of fields) {
    if (value === null || value === undefined || value === '' || value === false) continue
    if (Array.isArray(value)) {
      if (value.length > 0) lines.push(`${key}: [${value.map(v => JSON.stringify(v)).join(', ')}]`)
    } else {
      lines.push(`${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`)
    }
  }
  return lines.length ? `---\n${lines.join('\n')}\n---\n` : ''
}

/** Stakeholder names from the projects.stakeholders JSON ([{ "name": … }]). */
function parseStakeholderNames(raw: string): string[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(s => str(s?.name).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

/** Tag names as front matter allows them (no spaces). */
const yamlTags = (tags: string[]) => tags.map(t => t.trim().replace(/\s+/g, '-')).filter(Boolean)

/**
 * Note text as plain markdown: the editor's escaping undone, and asset://
 * images pointed at the assets folder (`depth` = folders below the mirror root).
 */
function body(text: unknown, depth: number, assetsFolder: string): string {
  const up = '../'.repeat(depth + 1)
  return cleanMarkdownExport(str(text))
    .replace(/!\[([^\]]*)\]\((asset:\/\/[^)\s]+)\)/g, (match, alt: string, src: string) => {
      const parts = parseAssetSrc(src)
      if (!parts) return match
      return `![${alt || parts.filename}](${encodeURI(`${up}${assetsFolder}/${parts.filename}`)})`
    })
    .trim()
}

/** Indent every line after the first, so multi-line text stays inside a list item. */
const indent = (text: string, by = '    ') => text.split('\n').map(l => (l ? by + l : l)).join('\n')

/** Hands out unique paths: a second "Budget.md" in a folder becomes "Budget (2).md". */
function pathAllocator() {
  const used = new Set<string>()
  return (folder: string, name: string): string => {
    const base = mirrorFileName(name)
    let path = `${folder}${base}.md`
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${folder}${base} (${n}).md`
    used.add(path.toLowerCase())
    return path
  }
}

/** `aliases` when the file name isn't the real name, so [[Real Name]] still finds it. */
function aliasFor(path: string, name: string): string[] {
  const file = path.slice(path.lastIndexOf('/') + 1, -3)
  return file === name.trim() ? [] : [name.trim()]
}

function taskLine(t: Row, depth: number, assetsFolder: string): string {
  const status = str(t.status)
  const box = status === 'done' ? '[x]' : status === 'in_progress' ? '[/]' : '[ ]'
  const bits = [`- ${box} ${str(t.title).trim() || 'Untitled task'}`]
  if (t.is_recurring) bits.push('🔁 recurring')
  if (t.start_date) bits.push(`🛫 ${str(t.start_date)}`)
  if (t.due_date) bits.push(`📅 ${str(t.due_date)}`)
  if (status === 'done' && t.completed_at) bits.push(`✅ ${localStamp(str(t.completed_at)).slice(0, 10)}`)
  const tags = parseTags(str(t.tags))
  if (tags.length) bits.push(tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join(' '))
  const extra = [body(t.description, depth, assetsFolder), body(t.notes, depth, assetsFolder)].filter(Boolean)
  return [bits.join(' '), ...extra.map(e => indent(e))].join('\n')
}

/** Open tasks first (in progress, then open), then done; each by due date. */
function sortTasks(tasks: Row[]): Row[] {
  const rank = (t: Row) => (t.status === 'in_progress' ? 0 : t.status === 'done' ? 2 : 1)
  return [...tasks].sort((a, b) =>
    rank(a) - rank(b) || (str(a.due_date) || '9999').localeCompare(str(b.due_date) || '9999') || str(a.title).localeCompare(str(b.title)))
}

export function buildMarkdownMirror(data: Row, opts: MirrorOptions): Map<string, string> {
  const files = new Map<string, string>()
  const alloc = pathAllocator()
  const { assetsFolder } = opts

  const options = new Map(rows(data, 'dropdownOptions').map(o => [o.id, str(o.label)]))
  const label = (id: unknown) => (id === null || id === undefined ? '' : options.get(id) ?? '')
  const projects = rows(data, 'projects')
  const tasks = rows(data, 'tasks')
  const workLog = rows(data, 'workLogEntries')

  const tasksByProject = new Map<unknown, Row[]>()
  for (const t of tasks) tasksByProject.set(t.project_id ?? null, [...(tasksByProject.get(t.project_id ?? null) ?? []), t])
  const logByProject = new Map<unknown, Row[]>()
  for (const w of workLog) logByProject.set(w.project_id, [...(logByProject.get(w.project_id) ?? []), w])

  // ── Projects ──
  const stakeholderOf = new Map<string, string[]>()
  for (const p of [...projects].sort((a, b) => str(a.work_item).localeCompare(str(b.work_item)))) {
    const name = str(p.work_item).trim() || 'Untitled project'
    const archived = !!p.is_archived
    const folder = archived ? 'Projects/Archived/' : 'Projects/'
    const depth = archived ? 2 : 1
    const path = alloc(folder, name)
    const stakeholders = parseStakeholderNames(str(p.stakeholders))
    for (const s of stakeholders) stakeholderOf.set(s.toLowerCase(), [...(stakeholderOf.get(s.toLowerCase()) ?? []), name])

    const out = [frontMatter([
      ['type', 'project'],
      ['aliases', aliasFor(path, name)],
      ['rag', str(p.rag_status)],
      ['priority', label(p.priority_id)],
      ['area', label(p.product_area_id)],
      ['status', label(p.status_id)],
      ['status_comment', str(p.latest_status).trim()],
      ['stakeholders', stakeholders],
      ['tags', yamlTags(parseTags(str(p.tags)))],
      ['due', str(p.due_date)],
      ['archived', archived ? (str(p.archived_at) ? localStamp(str(p.archived_at)).slice(0, 10) : true) : null],
      ['created', localStamp(str(p.created_at))],
      ['updated', localStamp(str(p.updated_at))],
    ]) + `# ${name}`]
    if (label(p.product_area_id)) out.push(`Area: [[${label(p.product_area_id)}]]`)
    if (stakeholders.length) out.push(`Stakeholders: ${stakeholders.map(s => `[[${s}]]`).join(', ')}`)
    if (str(p.latest_status).trim()) out.push(`**Status:** ${str(p.latest_status).trim()}`)
    const desc = body(p.work_desc, depth, assetsFolder)
    if (desc) out.push(desc)
    const own = sortTasks(tasksByProject.get(p.id) ?? [])
    if (own.length) out.push(`## Tasks\n\n${own.map(t => taskLine(t, depth, assetsFolder)).join('\n')}`)
    const log = [...(logByProject.get(p.id) ?? [])].sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
    if (log.length) {
      out.push(`## Work Log\n\n${log.map(w => `### ${localStamp(str(w.created_at))}\n\n${body(w.note, depth, assetsFolder)}`).join('\n\n')}`)
    }
    files.set(path, `${out.join('\n\n')}\n`)
  }

  // ── Areas and the Inbox: project-less tasks, plus each area's projects ──
  const areas = rows(data, 'dropdownOptions').filter(o => o.type === 'product_area')
  for (const a of [...areas].sort((x, y) => str(x.label).localeCompare(str(y.label)))) {
    const name = str(a.label).trim()
    if (!name) continue
    const path = alloc('Areas/', name)
    const areaProjects = projects.filter(p => p.product_area_id === a.id)
    const looseTasks = sortTasks((tasksByProject.get(null) ?? []).filter(t => t.product_area_id === a.id))
    const out = [frontMatter([['type', 'area'], ['aliases', aliasFor(path, name)]]) + `# ${name}`]
    const active = areaProjects.filter(p => !p.is_archived)
    const done = areaProjects.filter(p => p.is_archived)
    if (active.length) out.push(`## Projects\n\n${active.map(p => `- [[${str(p.work_item)}]]`).join('\n')}`)
    if (looseTasks.length) out.push(`## Tasks\n\n${looseTasks.map(t => taskLine(t, 1, assetsFolder)).join('\n')}`)
    if (done.length) out.push(`## Completed projects\n\n${done.map(p => `- [[${str(p.work_item)}]]`).join('\n')}`)
    files.set(path, `${out.join('\n\n')}\n`)
  }
  const areaIds = new Set(areas.map(a => a.id))
  const inbox = sortTasks((tasksByProject.get(null) ?? []).filter(t => !areaIds.has(t.product_area_id)))
  if (inbox.length) {
    files.set(alloc('', 'Inbox'), `${frontMatter([['type', 'inbox']])}# Inbox\n\nTasks with no project or area.\n\n${inbox.map(t => taskLine(t, 0, assetsFolder)).join('\n')}\n`)
  }

  // ── Notes ──
  for (const n of [...rows(data, 'notebookPages')].sort((a, b) => str(a.title).localeCompare(str(b.title)))) {
    const title = str(n.title).trim() || 'Untitled'
    const path = alloc('Notes/', title)
    const text = body(n.body, 1, assetsFolder)
    files.set(path, `${frontMatter([
      ['type', 'note'],
      ['aliases', aliasFor(path, title)],
      ['starred', !!n.starred],
      ['home', !!n.is_home],
      ['created', localStamp(str(n.created_at))],
      ['updated', localStamp(str(n.updated_at))],
    ])}# ${title}${text ? `\n\n${text}` : ''}\n`)
  }

  // ── Contacts ──
  for (const c of [...rows(data, 'contacts')].sort((a, b) => str(a.name).localeCompare(str(b.name)))) {
    const name = str(c.name).trim() || 'Unnamed contact'
    const path = alloc('Contacts/', name)
    const out = [frontMatter([
      ['type', 'contact'],
      ['aliases', aliasFor(path, name)],
      ['role', str(c.role).trim()],
      ['group', str(c.group_name).trim()],
      ['tags', yamlTags(parseTags(str(c.tags), true))],
      ['created', localStamp(str(c.created_at))],
      ['updated', localStamp(str(c.updated_at))],
    ]) + `# ${name}`]
    const facts = [str(c.role).trim() && `Role: ${str(c.role).trim()}`, str(c.group_name).trim() && `Group: ${str(c.group_name).trim()}`].filter(Boolean)
    if (facts.length) out.push(facts.join('  \n'))
    const whosWho = body(c.whos_who, 1, assetsFolder)
    if (whosWho) out.push(`## Who's who\n\n${whosWho}`)
    const notes = body(c.notes, 1, assetsFolder)
    if (notes) out.push(`## Notes\n\n${notes}`)
    const on = stakeholderOf.get(name.toLowerCase()) ?? []
    if (on.length) out.push(`## Stakeholder on\n\n${on.map(p => `- [[${p}]]`).join('\n')}`)
    files.set(path, `${out.join('\n\n')}\n`)
  }

  // ── Journal ──
  for (const j of rows(data, 'journalEntries')) {
    const date = str(j.entry_date)
    const text = body(j.body, 1, assetsFolder)
    if (!date || !text) continue
    files.set(alloc('Journal/', date), `${frontMatter([['type', 'journal'], ['date', date]])}# ${date}\n\n${text}\n`)
  }

  files.set('README.md', [
    '# MyWorker — markdown copy',
    '',
    `A read-only copy of everything in MyWorker as plain markdown, written by the app once a day (last: ${opts.today}).`,
    'It is there so your data can always be read without the app, and it opens as an Obsidian vault.',
    '',
    '**Edits here are overwritten** the next time the app updates this folder. Make changes in MyWorker.',
    'Files you add yourself are left alone. Items in the app\'s Trash are not included.',
    '',
    `- Projects/ — active projects (Projects/Archived/ for completed ones): fields, tasks and the work log`,
    `- Areas/ — each area's projects and the tasks that belong to the area directly`,
    `- Inbox.md — tasks with no project or area`,
    `- Notes/, Contacts/, Journal/ — notebook pages, contacts and daily journal entries`,
    `- Images live in ../${assetsFolder}/`,
    '',
    'Fields are in the front matter at the top of each file. Tasks use the Obsidian Tasks style:',
    '[ ] open, [/] in progress, [x] done, 🛫 start date, 📅 due date, ✅ completed.',
    '',
  ].join('\n'))

  return files
}
