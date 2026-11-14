/**
 * WorkLogPane — right pane of ProjectDetail.
 *
 * Shows the chronological list of work log entries (newest first) and
 * an inline form to add new entries. Each entry has a pencil icon that
 * switches it to edit mode; the created_at timestamp is preserved on save.
 * Entries can also be deleted via the trash icon. App-written task status
 * lines (started / completed / reopened) are hidden unless the filter is off.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { WorkLogEntry, NotebookBacklink } from '@/types'
import { updateWorkLogEntry, deleteWorkLogEntry } from '@/db/workLog'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { MarkdownField } from '@/components/MarkdownField'
import { Pencil, Trash2, Filter, Search, X, BookOpen, Link2 } from 'lucide-react'
import type { TagRef } from '@/db/tags'
import { recordRoute } from '@/lib/refRoutes'
import { loadGuiSettings, altRowStyle } from '@/lib/guiSettings'
import { useWikiEntities } from '@/hooks/useWikiEntities'

interface Props {
  projectId: number
  projectName?: string
  workLog: WorkLogEntry[]
  notebookRefs?: NotebookBacklink[]
  /** Records elsewhere (other projects' logs and tasks, journal, contacts) that [[link]] to this project. */
  mentions?: TagRef[]
  onSaved: () => void
}

type LogItem =
  | { kind: 'log'; entry: WorkLogEntry; sortKey: string }
  | { kind: 'note'; ref: NotebookBacklink; sortKey: string }
  | { kind: 'mention'; ref: TagRef; sortKey: string }

const MENTION_LABEL: Record<TagRef['sourceType'], string> = {
  project: 'Project', task: 'Task', worklog: 'Work log', note: 'Note', contact: 'Contact', journal: 'Journal',
}

/** Timeline sort key for a mention: journal entries carry a bare date, others a UTC timestamp. */
const mentionSortKey = (ref: TagRef) => ref.date.length === 10 ? `${ref.date} 12:00:00` : ref.date

export function WorkLogPane({ projectId, projectName, workLog, notebookRefs = [], mentions = [], onSaved }: Props) {
  const navigate = useNavigate()
  const wikiEntities = useWikiEntities()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [filterCompleted, setFilterCompleted] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [, forceGuiUpdate] = useState(0)

  useEffect(() => {
    const handler = () => forceGuiUpdate(n => n + 1)
    window.addEventListener('myworker:gui-settings-changed', handler)
    return () => window.removeEventListener('myworker:gui-settings-changed', handler)
  }, [])

  const { rowColor, rowOpacity } = loadGuiSettings()

  const filteredByCompletion = filterCompleted
    ? workLog.filter(e => !e.isSystem)
    : workLog
  const hiddenCount = workLog.length - filteredByCompletion.length

  const searchTerms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)

  // Merge work log entries and notebook backlinks into one sorted timeline
  const mergedItems = useMemo((): LogItem[] => {
    const logItems: LogItem[] = filteredByCompletion.map(e => ({
      kind: 'log', entry: e, sortKey: e.createdAt,
    }))
    const noteItems: LogItem[] = notebookRefs.map(r => ({
      kind: 'note', ref: r, sortKey: r.createdAt,
    }))
    const mentionItems: LogItem[] = mentions.map(r => ({
      kind: 'mention', ref: r, sortKey: mentionSortKey(r),
    }))
    return [...logItems, ...noteItems, ...mentionItems].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [filteredByCompletion, notebookRefs, mentions])

  const visibleItems = searchTerms.length > 0
    ? mergedItems.filter(item => {
        const text = item.kind === 'log'
          ? item.entry.note
          : item.kind === 'note'
            ? `${item.ref.pageTitle} ${item.ref.snippet}`
            : `${item.ref.title} ${item.ref.snippet ?? ''}`
        return searchTerms.every(term => text.toLowerCase().includes(term))
      })
    : mergedItems

  /** True if it's fine to drop the entry edit in progress (nothing changed, or the user agreed). */
  const canDiscardEdit = () => {
    if (editingId === null) return true
    const original = workLog.find(e => e.id === editingId)?.note ?? ''
    return editDraft.trim() === original.trim() || confirm('Discard your unsaved changes to this entry?')
  }

  const startEdit = (entry: WorkLogEntry) => {
    if (!canDiscardEdit()) return
    setEditingId(entry.id)
    setEditDraft(entry.note)
  }

  const cancelEdit = () => {
    if (!canDiscardEdit()) return
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = async (id: number) => {
    if (!editDraft.trim()) return
    try {
      const raw = editDraft.trim()
      const text = raw.replace(/\\\[([^\]\\]+)\\\]\(([^)]+)\)/g, '[$1]($2)')
      await updateWorkLogEntry(id, text)
      onSaved()
      setEditingId(null)
      setEditDraft('')
    } catch (err) {
      toast.error(`Failed to update entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (entry: WorkLogEntry) => {
    if (!confirm('Delete this work log entry? This cannot be undone.')) return
    try {
      await deleteWorkLogEntry(entry.id)
      onSaved()
    } catch (err) {
      toast.error(`Failed to delete entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Work Log</h2>
          <button
            onClick={() => setFilterCompleted(f => !f)}
            className={`p-0.5 rounded transition-colors ${filterCompleted ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title={filterCompleted ? 'Showing manual entries only (click to show all)' : 'Showing all entries (click to hide task status updates)'}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex items-center">
            <Search className="absolute left-1.5 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search log…"
              className="h-6 pl-5 pr-5 text-xs rounded border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-36"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">⌘/Ctrl+↵ to save</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {searchTerms.length > 0
            ? `${visibleItems.length} of ${mergedItems.length} entries`
            : filterCompleted && hiddenCount > 0
              ? `${filteredByCompletion.length} of ${workLog.length} log entries${notebookRefs.length > 0 ? ` · ${notebookRefs.length} note${notebookRefs.length !== 1 ? 's' : ''}` : ''}`
              : `${workLog.length} log entries${notebookRefs.length > 0 ? ` · ${notebookRefs.length} note${notebookRefs.length !== 1 ? 's' : ''}` : ''}`}
        </span>
      </div>

      <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
        {/* keyed so each project gets its own draft when moving between projects */}
        <WorkLogEntryForm key={projectId} projectId={projectId} projectName={projectName} onSaved={onSaved} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
        {mergedItems.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries yet. Add one above to get started.</p>
        )}
        {mergedItems.length > 0 && visibleItems.length === 0 && searchTerms.length > 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries match your search.</p>
        )}
        {mergedItems.length > 0 && visibleItems.length === 0 && searchTerms.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">All entries are task status updates. Click the filter button to show them.</p>
        )}
        {visibleItems.map((item, index) => {
          if (item.kind === 'note') {
            const ref = item.ref
            const dateStr = new Date(ref.createdAt.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleString()
            return (
              <div key={`note-${ref.pageId}`} className="px-3 py-2" style={altRowStyle(rowColor, rowOpacity, index)}>
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/notebook?page=${ref.pageId}`)}
                  className="text-left group"
                >
                  <p className="text-sm font-medium text-primary group-hover:underline">{ref.pageTitle || 'Untitled'}</p>
                  {ref.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{ref.snippet}</p>
                  )}
                </button>
              </div>
            )
          }

          if (item.kind === 'mention') {
            const ref = item.ref
            const when = ref.date.length === 10
              ? new Date(ref.date + 'T12:00:00').toLocaleDateString()
              : new Date(ref.date.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleString()
            return (
              <div key={`mention-${ref.sourceType}-${ref.id}`} className="px-3 py-2" style={altRowStyle(rowColor, rowOpacity, index)}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">{when} · mentioned in {MENTION_LABEL[ref.sourceType].toLowerCase()}</p>
                </div>
                <button type="button" onClick={() => navigate(recordRoute(ref))} className="text-left group">
                  <p className="text-sm font-medium text-primary group-hover:underline">
                    {ref.sourceType === 'journal' ? `Journal ${ref.title}` : ref.title}
                  </p>
                  {ref.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{ref.snippet}</p>
                  )}
                </button>
              </div>
            )
          }

          const entry = item.entry
          const isAutoEntry = entry.isSystem
          return (
            <div key={`log-${entry.id}`} className="px-3 py-2" style={altRowStyle(rowColor, rowOpacity, index)}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt.replace(' ', 'T').replace(/([^Z])$/, '$1Z')).toLocaleString()}
                </p>
                {editingId !== entry.id && (
                  <>
                    <button
                      onClick={() => startEdit(entry)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                      title="Edit entry"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry)}
                      className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {editingId === entry.id ? (
                <div className="space-y-2">
                  <MarkdownField
                    id={`worklog-edit-${entry.id}`}
                    headerLabel={projectName}
                    value={editDraft}
                    onChange={setEditDraft}
                    rows={3}
                    expandable
                    initialFocused
                    enableWikiLinks
                    wikiEntities={wikiEntities}
                    onKeyDown={e => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(entry.id) }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(entry.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent text-muted-foreground"
                    >
                      Cancel
                    </button>
                    <span className="text-xs text-muted-foreground">⌘/Ctrl+↵ to save · Esc to cancel</span>
                  </div>
                </div>
              ) : (
                <div className={isAutoEntry ? 'opacity-60' : ''}>
                  <WikiLinkContent>{entry.note}</WikiLinkContent>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
