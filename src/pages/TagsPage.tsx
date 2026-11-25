/**
 * TagsPage — every tag in use across the app, where it is used, and the
 * tools to rename, merge or delete it.
 *
 * Tags come from two places (see db/tags.ts): the tag fields on projects,
 * tasks and contacts, and inline #tags written in any markdown text.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, X, Pencil, Trash2, ArrowDown, ArrowUp } from 'lucide-react'
import { ENTITY_ICONS } from '@/lib/icons'
import { getTagUsage, renameTag, deleteTag, type TagUsage, type TagRef, type TagSourceType } from '@/db/tags'
import { tagKey, isHashtagName } from '@/lib/tags'
import { recordRoute } from '@/lib/refRoutes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const GROUPS: { type: TagSourceType; label: string; icon: typeof ENTITY_ICONS.tag }[] = [
  { type: 'project', label: 'Projects', icon: ENTITY_ICONS.project },
  { type: 'task', label: 'Tasks', icon: ENTITY_ICONS.task },
  { type: 'worklog', label: 'Work log', icon: ENTITY_ICONS.worklog },
  { type: 'note', label: 'Notes', icon: ENTITY_ICONS.note },
  { type: 'journal', label: 'Journal', icon: ENTITY_ICONS.journal },
  { type: 'contact', label: 'Contacts', icon: ENTITY_ICONS.contact },
]

type TagSort = { by: 'count' | 'name' | 'recent'; dir: 'asc' | 'desc' }
const SORT_KEY = 'myworker:tags-sort'

// Which kinds of record to list for the selected tag, and whether to list them
// newest first in one list or grouped by kind
type Scope = 'all' | TagSourceType
type Layout = 'newest' | 'grouped'
const SCOPE_KEY = 'myworker:tags-scope'
const LAYOUT_KEY = 'myworker:tags-layout'

function loadScope(): Scope {
  try {
    const v = localStorage.getItem(SCOPE_KEY)
    if (v && GROUPS.some(g => g.type === v)) return v as TagSourceType
  } catch { /* fall through to the default */ }
  return 'all'
}

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'grouped' ? 'grouped' : 'newest'
  } catch {
    return 'newest'
  }
}

function saveSetting(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not essential */ }
}

/** Newest first. Dates are 'YYYY-MM-DD HH:MM:SS' or a bare 'YYYY-MM-DD' (journal), so they compare as text. */
const byNewest = (a: TagRef, b: TagRef) => b.date.localeCompare(a.date)

function loadSort(): TagSort {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null')
    if (['count', 'name', 'recent'].includes(saved?.by) && (saved?.dir === 'asc' || saved?.dir === 'desc')) return saved
  } catch { /* fall through to the default */ }
  return { by: 'count', dir: 'desc' }
}

function fmtWhen(date: string): string {
  if (!date) return ''
  // Journal entries carry a bare YYYY-MM-DD date
  if (date.length === 10) return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return new Date(date.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TagsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedKey = tagKey(searchParams.get('tag') ?? '')

  const [tags, setTags] = useState<TagUsage[] | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<TagSort>(loadSort)
  const [scope, setScopeState] = useState<Scope>(loadScope)
  const [layout, setLayoutState] = useState<Layout>(loadLayout)
  const setScope = (v: Scope) => { setScopeState(v); saveSetting(SCOPE_KEY, v) }
  const setLayout = (v: Layout) => { setLayoutState(v); saveSetting(LAYOUT_KEY, v) }

  // Clicking the active sort flips its direction; switching starts from the
  // natural direction for that column (most-used / most recently used first, or A→Z).
  const sortBy = (by: TagSort['by']) => {
    const next: TagSort = sort.by === by
      ? { by, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { by, dir: by === 'name' ? 'asc' : 'desc' }
    setSort(next)
    localStorage.setItem(SORT_KEY, JSON.stringify(next))
  }
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setTags(await getTagUsage())
    } catch (err) {
      toast.error(`Failed to load tags: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visibleTags = useMemo(() => {
    const q = tagKey(filter.replace(/^#/, ''))
    const byName = (a: TagUsage, b: TagUsage) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    const flip = sort.dir === 'asc' ? 1 : -1
    // refs are newest first, so a tag's last use is its first ref
    const lastUsed = (t: TagUsage) => t.refs[0]?.date ?? ''
    return (tags ?? [])
      .filter(t => !q || t.key.includes(q))
      // Count and date ties always fall back to A→Z so the order is stable
      .sort((a, b) => sort.by === 'name'
        ? flip * byName(a, b)
        : sort.by === 'recent'
          ? flip * lastUsed(a).localeCompare(lastUsed(b)) || byName(a, b)
          : flip * (a.refs.length - b.refs.length) || byName(a, b))
  }, [tags, filter, sort])

  const selected = tags?.find(t => t.key === selectedKey) ?? null
  const usedInline = !!selected?.refs.some(r => r.snippet !== null)
  const countOf = (type: TagSourceType) => selected?.refs.filter(r => r.sourceType === type).length ?? 0
  const scopedRefs = (selected?.refs ?? [])
    .filter(r => scope === 'all' || r.sourceType === scope)
    .sort(byNewest)

  // ── Rename / merge ────────────────────────────────────────────────────────
  const newName = renameDraft.trim().replace(/^#/, '')
  const mergeTarget = selected && newName && tagKey(newName) !== selected.key
    ? tags?.find(t => t.key === tagKey(newName)) ?? null
    : null
  const renameError = !newName
    ? 'Enter a tag name.'
    : usedInline && !isHashtagName(newName)
      ? 'This tag is written inline as #tag, so its name must start with a letter and use only letters, digits, "-", "_" or "/".'
      : null

  const openRename = () => {
    if (!selected) return
    setRenameDraft(selected.name)
    setRenameOpen(true)
  }

  const confirmRename = async () => {
    if (!selected || renameError || busy) return
    if (newName === selected.name) { setRenameOpen(false); return }
    setBusy(true)
    try {
      // When merging, adopt the target tag's existing spelling
      const finalName = mergeTarget?.name ?? newName
      const changed = await renameTag(selected.name, finalName)
      toast.success(mergeTarget
        ? `Merged #${selected.name} into #${finalName} (${changed} record${changed === 1 ? '' : 's'} updated)`
        : `Renamed #${selected.name} to #${finalName} (${changed} record${changed === 1 ? '' : 's'} updated)`)
      setRenameOpen(false)
      setSearchParams({ tag: finalName }, { replace: true })
      await load()
    } catch (err) {
      toast.error(`Failed to rename tag: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || busy) return
    const n = selected.refs.length
    if (!confirm(
      `Delete the tag "${selected.name}" from ${n} record${n === 1 ? '' : 's'}?\n\n` +
      `It is removed from tag fields; where it is written inline, "#${selected.name}" becomes the plain word "${selected.name}". ` +
      `The records themselves are not deleted. This cannot be undone.`,
    )) return
    setBusy(true)
    try {
      await deleteTag(selected.name)
      toast.success(`Deleted #${selected.name}`)
      setSearchParams({}, { replace: true })
      await load()
    } catch (err) {
      toast.error(`Failed to delete tag: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const openRef = (ref: TagRef) => navigate(recordRoute(ref))

  const scopePill = (value: Scope, label: string, count: number, Icon?: typeof ENTITY_ICONS.tag) => (
    <button
      key={value}
      type="button"
      onClick={() => setScope(value)}
      className={`h-7 px-3 rounded-full border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
        scope === value
          ? 'bg-primary text-primary-foreground border-primary'
          : count === 0
            ? 'border-input text-muted-foreground/50 hover:text-muted-foreground'
            : 'border-input text-muted-foreground hover:text-foreground hover:border-foreground/40'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label} ({count})
    </button>
  )

  // One use of the tag. In the single newest-first list each row shows its kind's icon.
  const refRow = (ref: TagRef, showKind: boolean) => {
    const group = GROUPS.find(g => g.type === ref.sourceType)
    const Icon = group?.icon ?? ENTITY_ICONS.tag
    return (
      <button
        key={`${ref.sourceType}-${ref.id}`}
        onClick={() => openRef(ref)}
        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
      >
        <div className="flex items-baseline gap-2">
          {showKind && (
            <span title={group?.label} className="self-center shrink-0 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="text-sm font-medium truncate">{ref.title}</span>
          {ref.inField && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1 shrink-0">tag field</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground shrink-0">{fmtWhen(ref.date)}</span>
        </div>
        {ref.snippet && (
          <p className={`text-xs text-muted-foreground line-clamp-2 mt-0.5 ${showKind ? 'pl-[1.375rem]' : ''}`}>{ref.snippet}</p>
        )}
      </button>
    )
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* ── Tag list ─────────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="px-3 py-2 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold flex items-center gap-1.5"><ENTITY_ICONS.tag className="h-4 w-4" /> Tags</h1>
            {tags && <span className="text-xs text-muted-foreground">{tags.length}</span>}
          </div>
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter tags…"
              className="h-8 pl-7 pr-7 text-sm"
            />
            {filter && (
              <button onClick={() => setFilter('')} className="absolute right-2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {(['name', 'recent', 'count'] as const).map(by => (
              <button
                key={by}
                type="button"
                onClick={() => sortBy(by)}
                title={by === 'recent' ? 'Sort by most recent use' : `Sort by ${by}`}
                className={`flex items-center gap-0.5 hover:text-foreground transition-colors ${sort.by === by ? 'text-foreground font-medium' : ''}`}
              >
                {by === 'name' ? 'Name' : by === 'recent' ? 'Recent' : 'Count'}
                {sort.by === by && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tags === null && <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>}
          {tags?.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No tags yet. Type <span className="hashtag">#tag</span> in any note, work log entry or task, or add tags to a project, task or contact.
            </p>
          )}
          {tags && tags.length > 0 && visibleTags.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">No tags match.</p>
          )}
          {visibleTags.map(t => (
            <button
              key={t.key}
              onClick={() => setSearchParams({ tag: t.name })}
              className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left text-sm hover:bg-accent transition-colors ${t.key === selectedKey ? 'bg-accent' : ''}`}
            >
              <span className="truncate">#{t.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{t.refs.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Selected tag ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
            {selectedKey && tags ? `No tag named "${searchParams.get('tag')}" is in use.` : 'Select a tag to see where it is used.'}
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5 max-w-4xl">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold truncate">#{selected.name}</h2>
              <span className="text-sm text-muted-foreground shrink-0">
                {selected.refs.length} use{selected.refs.length === 1 ? '' : 's'}
              </span>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={openRename} disabled={busy}>
                  <Pencil className="h-3.5 w-3.5" /> Rename / merge
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            {/* Kind filter (as on the Search screen) and list layout */}
            <div className="flex items-center gap-2 flex-wrap">
              {scopePill('all', 'All', selected.refs.length)}
              {GROUPS.map(({ type, label, icon }) => scopePill(type, label, countOf(type), icon))}
              <div className="ml-auto flex items-center rounded-md border overflow-hidden">
                {(['newest', 'grouped'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setLayout(v)}
                    title={v === 'newest' ? 'One list, newest first' : 'Grouped by kind, newest first within each'}
                    className={`h-7 px-2.5 text-xs font-medium border-r last:border-r-0 transition-colors ${layout === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
                    {v === 'newest' ? 'Newest first' : 'By type'}
                  </button>
                ))}
              </div>
            </div>

            {scopedRefs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No {GROUPS.find(g => g.type === scope)?.label.toLowerCase()} use #{selected.name}.
              </p>
            )}

            {layout === 'newest' ? (
              scopedRefs.length > 0 && (
                <div className="border rounded-md divide-y">
                  {scopedRefs.map(ref => refRow(ref, true))}
                </div>
              )
            ) : GROUPS.map(({ type, label, icon: Icon }) => {
              const refs = scopedRefs.filter(r => r.sourceType === type)
              if (refs.length === 0) return null
              return (
                <section key={type} className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" /> {label} <span className="font-normal">({refs.length})</span>
                  </h3>
                  <div className="border rounded-md divide-y">
                    {refs.map(ref => refRow(ref, false))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Rename / merge dialog ────────────────────────────────────────── */}
      <Dialog open={renameOpen} onOpenChange={v => { if (!v && !busy) setRenameOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename or merge #{selected?.name}</DialogTitle>
            <DialogDescription>
              The change is applied everywhere the tag is used — tag fields and inline #tags.
              To merge, enter the name of another existing tag.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={e => setRenameDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmRename() } }}
            list="tag-rename-options"
            autoFocus
          />
          <datalist id="tag-rename-options">
            {(tags ?? []).filter(t => t.key !== selected?.key).map(t => <option key={t.key} value={t.name} />)}
          </datalist>
          {renameError && renameDraft.trim() !== '' && (
            <p className="text-xs text-destructive">{renameError}</p>
          )}
          {!renameError && mergeTarget && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              #{mergeTarget.name} already exists ({mergeTarget.refs.length} use{mergeTarget.refs.length === 1 ? '' : 's'}).
              The two tags will be merged into #{mergeTarget.name}. This cannot be undone.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={confirmRename} disabled={!!renameError || busy}>
              {busy ? 'Working…' : mergeTarget ? 'Merge' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
