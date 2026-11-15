/**
 * TrashPage — deleted projects, tasks, work log entries, notes and contacts,
 * kept for TRASH_DAYS days. Restore puts an item back exactly as it was.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Trash2, RotateCcw, FolderKanban, CheckSquare, ScrollText, BookOpen, UserRound } from 'lucide-react'
import {
  getTrashItems, restoreFromTrash, deleteFromTrash, emptyTrash,
  TRASH_DAYS, TRASH_CHANGED_EVENT, type TrashItem, type TrashItemType,
} from '@/db/trash'
import { Button } from '@/components/ui/button'

const TYPE_INFO: Record<TrashItemType, { label: string; icon: typeof Trash2 }> = {
  project: { label: 'Project', icon: FolderKanban },
  task: { label: 'Task', icon: CheckSquare },
  worklog: { label: 'Work log entry', icon: ScrollText },
  note: { label: 'Note', icon: BookOpen },
  contact: { label: 'Contact', icon: UserRound },
}

function parseUtc(ts: string): Date {
  return new Date(ts.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
}

function daysLeft(deletedAt: string): number {
  const ageDays = (Date.now() - parseUtc(deletedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(TRASH_DAYS - ageDays))
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [busyId, setBusyId] = useState<number | 'all' | null>(null)

  const load = useCallback(() => {
    getTrashItems()
      .then(setItems)
      .catch(err => toast.error(`Failed to load the trash: ${err instanceof Error ? err.message : String(err)}`))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(TRASH_CHANGED_EVENT, load)
    return () => window.removeEventListener(TRASH_CHANGED_EVENT, load)
  }, [load])

  const restore = async (item: TrashItem) => {
    setBusyId(item.id)
    try {
      const note = await restoreFromTrash(item.id)
      toast.success(`Restored "${item.title}"${note ? `. ${note}` : ''}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const deleteForever = async (item: TrashItem) => {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return
    setBusyId(item.id)
    try {
      await deleteFromTrash(item.id)
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusyId(null)
    }
  }

  const empty = async () => {
    if (!items?.length) return
    if (!confirm(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in the trash? This cannot be undone.`)) return
    setBusyId('all')
    try {
      await emptyTrash()
      toast.success('Trash emptied')
    } catch (err) {
      toast.error(`Failed to empty the trash: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Trash2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Deleted items are kept for {TRASH_DAYS} days, then removed automatically.
        </p>
        {items && items.length > 0 && (
          <Button variant="outline" size="sm" className="ml-auto text-destructive hover:text-destructive"
            onClick={empty} disabled={busyId !== null}>
            Empty trash
          </Button>
        )}
      </div>

      {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items?.length === 0 && (
        <p className="text-sm text-muted-foreground border rounded-md px-4 py-8 text-center">The trash is empty.</p>
      )}

      {items && items.length > 0 && (
        <div className="border rounded-md divide-y">
          {items.map(item => {
            const { label, icon: Icon } = TYPE_INFO[item.itemType]
            const left = daysLeft(item.deletedAt)
            return (
              <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={item.title}>{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {label}{item.detail ? ` · ${item.detail}` : ''} · deleted {parseUtc(item.deletedAt).toLocaleString()}
                    {' · '}<span className={left <= 3 ? 'text-amber-700 dark:text-amber-400' : ''}>
                      {left === 0 ? 'removed at next start' : `${left} day${left === 1 ? '' : 's'} left`}
                    </span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => restore(item)} disabled={busyId !== null}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
                <button
                  type="button"
                  onClick={() => deleteForever(item)}
                  disabled={busyId !== null}
                  title="Delete permanently"
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
