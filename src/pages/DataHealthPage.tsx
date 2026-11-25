/**
 * DataHealthPage — clutter and broken references in one place, each with a fix.
 * The checks live in db/health.ts; fixes rewrite text, move items to the Trash
 * or tidy files, never deleting user records outright.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, RefreshCw, Link2Off, FileWarning, ImageOff, ChevronDown, ChevronRight, ListChecks } from 'lucide-react'
import {
  findBrokenLinks, repointLinks, unlinkLinks, createNoteForLink,
  findOpenTasksInArchivedProjects, closeTasksOfArchivedProjects,
  findEmptyNotes, trashNotes, findDuplicateContacts, findUnusedOptions, findSimilarTags, mergeTags,
  type BrokenLink, type ArchivedOpenTask, type EmptyNote, type DuplicateContacts, type UnusedOption, type SimilarTags,
} from '@/db/health'
import { deleteDropdownOption } from '@/db/dropdownOptions'
import { listFolderLeftovers, tidyFolderLeftovers, SNAPSHOT_FOLDER, LEFTOVER_FOLDER, type FolderLeftover } from '@/db'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { recordRoute } from '@/lib/refRoutes'
import { findWikiEntity } from '@/lib/wikiLinks'
import { isHashtagName } from '@/lib/tags'
import { ENTITY_ICONS, SCREEN_ICONS } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Report {
  brokenLinks: BrokenLink[]
  archivedTasks: ArchivedOpenTask[]
  emptyNotes: EmptyNote[]
  duplicates: DuplicateContacts[]
  unusedOptions: UnusedOption[]
  similarTags: SimilarTags[]
  leftovers: FolderLeftover[]
}

const OPTION_LABEL: Record<UnusedOption['type'], string> = { priority: 'Priority', product_area: 'Area', project_status: 'Status' }

function fmtDate(utc: string): string {
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** One check: title, count (or a green tick when clear), what it means, and its rows. */
function Section({ icon: Icon, title, count, hint, actions, footer, children }: {
  icon: typeof SCREEN_ICONS.health
  title: string
  count: number
  hint: string
  actions?: ReactNode
  /** Shown below the rows even when there is nothing to fix. */
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="border rounded-lg">
      <div className="px-4 py-3 flex items-center gap-2 border-b bg-muted/30">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count === 0
          ? <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="All clear" />
          : <span className="text-xs font-semibold rounded-full px-2 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100 tabular-nums">{count}</span>}
        <div className="ml-auto flex items-center gap-2">{count > 0 && actions}</div>
      </div>
      <p className="px-4 pt-2 text-xs text-muted-foreground">{hint}</p>
      <div className="px-4 pb-3 pt-2">{count === 0 ? <p className="text-sm text-muted-foreground">Nothing to fix.</p> : children}</div>
      {footer && <div className="px-4 pb-3 -mt-1">{footer}</div>}
    </section>
  )
}

export default function DataHealthPage() {
  const navigate = useNavigate()
  const entities = useWikiEntities()
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pointDraft, setPointDraft] = useState<Record<string, string>>({})
  // Journal-only links (planned notes never written) are hidden unless asked for
  const [showJournalLinks, setShowJournalLinks] = useState(false)
  // Similar tags: the name chosen to keep, per group (keyed by the group's first name)
  const [keepTag, setKeepTag] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [brokenLinks, archivedTasks, emptyNotes, duplicates, unusedOptions, similarTags, leftovers] = await Promise.all([
        findBrokenLinks(), findOpenTasksInArchivedProjects(), findEmptyNotes(), findDuplicateContacts(),
        findUnusedOptions(), findSimilarTags(), listFolderLeftovers().catch(() => []),
      ])
      setReport({ brokenLinks, archivedTasks, emptyNotes, duplicates, unusedOptions, similarTags, leftovers })
    } catch (err) {
      toast.error(`Data Health check failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Run a fix, report it, and re-check
  const fix = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(done)
      await load()
    } catch (err) {
      toast.error(`Fix failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  if (!report) {
    return <div className="p-6 text-sm text-muted-foreground">Checking your data…</div>
  }

  // A link only the Journal uses, with no close match, is a note planned for a day — not a mistake
  const isPlannedNote = (link: BrokenLink) => link.onlyInJournal && !link.suggestion
  const plannedCount = report.brokenLinks.filter(isPlannedNote).length
  const brokenLinks = showJournalLinks ? report.brokenLinks : report.brokenLinks.filter(l => !isPlannedNote(l))

  const issues = brokenLinks.length + report.archivedTasks.length + report.emptyNotes.length +
    report.duplicates.length + report.unusedOptions.length + report.similarTags.length + report.leftovers.length

  const rowBtn = 'text-left text-sm hover:underline truncate'

  return (
    <div className="h-[calc(100vh-57px)] overflow-y-auto">
      <div className="max-w-4xl px-6 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <SCREEN_ICONS.health className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Data Health</h1>
          <span className="text-sm text-muted-foreground">
            {issues === 0 ? 'Everything looks clean.' : `${plural(issues, 'thing')} to look at.`}
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => { setReport(null); load() }} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" /> Check again
          </Button>
        </div>

        {/* ── Broken links ── */}
        <Section icon={Link2Off} title="Broken links" count={brokenLinks.length}
          hint="[[Links]] whose name matches no note, project, contact or area — usually a typo, or something deleted or renamed outside the app. Point them at the right thing, make them plain text, or create a note with that name."
          footer={plannedCount > 0 && (
            <button type="button" onClick={() => setShowJournalLinks(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              {showJournalLinks
                ? `Hide the ${plural(plannedCount, 'Journal link')} to notes never written`
                : `${plural(plannedCount, 'link')} only in the Journal (notes planned for a day but never written) ${plannedCount === 1 ? 'isn’t' : 'aren’t'} listed — show`}
            </button>
          )}>
          <div className="divide-y">
            {brokenLinks.map(link => {
              const open = expanded === link.name
              const draft = pointDraft[link.name] ?? ''
              const target = findWikiEntity(entities, draft)
              return (
                <div key={link.name} className="py-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setExpanded(open ? null : link.name)} className="flex items-center gap-1 text-sm font-medium min-w-0">
                      {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">[[{link.name}]]</span>
                    </button>
                    <span className="text-xs text-muted-foreground shrink-0">in {plural(link.refs.length, 'place')}</span>
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                      {link.suggestion && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                          title={`Change these links to [[${link.suggestion.name}]]`}
                          onClick={() => fix(() => repointLinks(link.name, link.suggestion!.name), `Linked to ${link.suggestion!.name}`)}>
                          Point to “{link.suggestion.name}”
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                        onClick={() => fix(() => unlinkLinks(link.name), `[[${link.name}]] is now plain text`)}>
                        Make plain text
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                        onClick={() => fix(() => createNoteForLink(link.name), `Created note “${link.name}”`)}>
                        Create note
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div className="pl-5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Input value={draft} list="health-entity-names" placeholder="Point to another name…"
                          onChange={e => setPointDraft(d => ({ ...d, [link.name]: e.target.value }))}
                          className="h-7 text-xs max-w-sm" />
                        <Button size="sm" className="h-7 text-xs" disabled={busy || !target}
                          onClick={() => fix(() => repointLinks(link.name, target!.name), `Linked to ${target!.name}`)}>
                          Point
                        </Button>
                      </div>
                      <ul className="space-y-0.5">
                        {link.refs.map(ref => {
                          const Icon = ENTITY_ICONS[ref.sourceType]
                          return (
                            <li key={`${ref.sourceType}-${ref.id}`} className="flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <button type="button" className={rowBtn} onClick={() => navigate(recordRoute(ref))}>{ref.title}</button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <datalist id="health-entity-names">
            {entities.map(e => <option key={`${e.type}-${e.id}`} value={e.name} />)}
          </datalist>
        </Section>

        {/* ── Open tasks in archived projects ── */}
        <Section icon={ListChecks} title="Open tasks in archived projects" count={report.archivedTasks.length}
          hint="Tasks still open in a project that's been marked complete (for example, added after it was closed). Marking them done works like closing the project: reopening it brings them back."
          actions={
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
              onClick={() => fix(() => closeTasksOfArchivedProjects(report.archivedTasks.map(t => t.id)), `Marked ${plural(report.archivedTasks.length, 'task')} done`)}>
              Mark all done
            </Button>
          }>
          <ul className="divide-y">
            {report.archivedTasks.map(t => (
              <li key={t.id} className="py-1.5 flex items-center gap-2">
                <ENTITY_ICONS.task className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <button type="button" className={rowBtn} onClick={() => navigate(`/projects/${t.projectId}`)}>{t.title}</button>
                <span className="text-xs text-muted-foreground truncate">· {t.projectName}</span>
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs shrink-0" disabled={busy}
                  onClick={() => fix(() => closeTasksOfArchivedProjects([t.id]), `Marked “${t.title}” done`)}>
                  Mark done
                </Button>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Empty notes ── */}
        <Section icon={ENTITY_ICONS.note} title="Empty notes" count={report.emptyNotes.length}
          hint="Notebook pages with no text, often left by clicking a link to a note that didn't exist yet. They go to the Trash, where you can restore them for 30 days."
          actions={
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
              title="Notes that other text links to are left alone"
              onClick={() => {
                const ids = report.emptyNotes.filter(n => !n.linkedTo).map(n => n.id)
                fix(() => trashNotes(ids), `Moved ${plural(ids.length, 'empty note')} to the Trash`)
              }}>
              Move unlinked ones to Trash
            </Button>
          }>
          <ul className="divide-y">
            {report.emptyNotes.map(n => (
              <li key={n.id} className="py-1.5 flex items-center gap-2">
                <ENTITY_ICONS.note className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <button type="button" className={rowBtn} onClick={() => navigate(`/notebook?page=${n.id}`)}>{n.title}</button>
                <span className="text-xs text-muted-foreground shrink-0">created {fmtDate(n.createdAt)}</span>
                {n.linkedTo && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1 shrink-0"
                    title="Other text links to this note — moving it to the Trash would break those links">linked</span>
                )}
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs shrink-0" disabled={busy}
                  onClick={() => fix(() => trashNotes([n.id]), `Moved “${n.title}” to the Trash`)}>
                  Move to Trash
                </Button>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Duplicate contacts ── */}
        <Section icon={ENTITY_ICONS.contact} title="Possible duplicate contacts" count={report.duplicates.length}
          hint="Contacts whose names match apart from capitals, spacing or punctuation. Open them to decide which to keep; links and stakeholder lists match either spelling.">
          <ul className="divide-y">
            {report.duplicates.map(g => (
              <li key={g.name} className="py-1.5 flex items-center gap-2 flex-wrap">
                <ENTITY_ICONS.contact className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {g.contacts.map((c, i) => (
                  <span key={c.id} className="text-sm">
                    {i > 0 && <span className="text-muted-foreground mr-2">·</span>}
                    <button type="button" className="hover:underline" onClick={() => navigate(`/contacts?q=${encodeURIComponent(c.name)}`)}>{c.name}</button>
                    {c.role && <span className="text-xs text-muted-foreground"> ({c.role})</span>}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Unused dropdown values ── */}
        <Section icon={ENTITY_ICONS.area} title="Unused dropdown values" count={report.unusedOptions.length}
          hint="Priorities, areas and statuses no project or task uses (linked areas and the “Done” status are never listed). Deleting one is permanent, but nothing uses it.">
          <ul className="divide-y">
            {report.unusedOptions.map(o => (
              <li key={o.id} className="py-1.5 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-12 shrink-0">{OPTION_LABEL[o.type]}</span>
                <span className="text-sm truncate">{o.label}</span>
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs shrink-0 text-destructive hover:text-destructive" disabled={busy}
                  onClick={() => {
                    if (!confirm(`Delete the unused ${OPTION_LABEL[o.type].toLowerCase()} “${o.label}”?`)) return
                    fix(() => deleteDropdownOption(o.id), `Deleted “${o.label}”`)
                  }}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Similar tags ── */}
        <Section icon={ENTITY_ICONS.tag} title="Similar tags" count={report.similarTags.length}
          hint="Tags that look like one tag written differently — apart from spaces, punctuation, a plural or one letter. Pick the spelling to keep and merge the others into it. A name with spaces can't replace a tag written inline as #tag.">
          <ul className="divide-y">
            {report.similarTags.map(group => {
              const id = group.tags[0].name
              const inline = group.tags.some(t => t.inline)
              const canKeep = (name: string) => !inline || isHashtagName(name)
              const keep = keepTag[id] ?? group.tags.find(t => canKeep(t.name))?.name ?? null
              const others = group.tags.filter(t => t.name !== keep).map(t => t.name)
              return (
                <li key={id} className="py-1.5 flex items-center gap-1.5 flex-wrap">
                  {group.tags.map(t => (
                    <button key={t.name} type="button" disabled={!canKeep(t.name)}
                      onClick={() => setKeepTag(k => ({ ...k, [id]: t.name }))}
                      title={canKeep(t.name) ? `Keep “${t.name}”` : 'Used inline as #tag elsewhere, so a name with spaces can’t replace it'}
                      className={`text-xs rounded-full border px-2 py-0.5 tabular-nums disabled:opacity-50 disabled:cursor-not-allowed ${t.name === keep ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
                      #{t.name} <span className="opacity-70">· {t.count}</span>
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/tags?tag=${encodeURIComponent(id)}`)}>
                      Open in Tags
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !keep}
                      title={keep ? `Rename ${others.map(n => `#${n}`).join(', ')} to #${keep}` : undefined}
                      onClick={() => fix(() => mergeTags(others, keep!), `Merged into #${keep}`)}>
                      Merge into #{keep}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>

        {/* ── Leftover files ── */}
        <Section icon={FileWarning} title="Leftover copies in your storage folder" count={report.leftovers.length}
          hint={`Conflict and salvage copies the app saved next to your data file. Tidying moves them into ${SNAPSHOT_FOLDER}/${LEFTOVER_FOLDER} — nothing is deleted.`}
          actions={
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
              onClick={() => fix(() => tidyFolderLeftovers(report.leftovers.map(f => f.name)), `Moved ${plural(report.leftovers.length, 'file')} into ${LEFTOVER_FOLDER}`)}>
              Tidy all
            </Button>
          }>
          <ul className="divide-y">
            {report.leftovers.map(f => (
              <li key={f.name} className="py-1.5 flex items-center gap-2 text-sm">
                <span className="font-mono text-xs truncate">{f.name}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {new Date(f.modified).toLocaleDateString()} · {Math.max(1, Math.round(f.size / 1024))} KB
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Unused images (existing tool in Settings) ── */}
        <section className="border rounded-lg px-4 py-3 flex items-center gap-2">
          <ImageOff className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Unused images</h2>
          <span className="text-xs text-muted-foreground">Pasted images no note uses any more.</span>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => navigate('/settings?tab=data')}>
            Open in Settings → Data
          </Button>
        </section>
      </div>
    </div>
  )
}
