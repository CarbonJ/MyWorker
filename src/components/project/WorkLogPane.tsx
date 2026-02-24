/**
 * WorkLogPane — right pane of ProjectDetail.
 *
 * Shows the chronological list of work log entries (newest first) and
 * an inline form to add new entries. Each entry has a pencil icon that
 * switches it to edit mode; the created_at timestamp is preserved on save.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { WorkLogEntry } from '@/types'
import { updateWorkLogEntry } from '@/db/workLog'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Pencil, Check, X } from 'lucide-react'

interface Props {
  projectId: number
  workLog: WorkLogEntry[]
  onSaved: () => void
}

export function WorkLogPane({ projectId, workLog, onSaved }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const startEdit = (entry: WorkLogEntry) => {
    setEditingId(entry.id)
    setEditDraft(entry.note)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = async (id: number) => {
    if (!editDraft.trim()) return
    try {
      await updateWorkLogEntry(id, editDraft.trim())
      onSaved()
      setEditingId(null)
      setEditDraft('')
    } catch (err) {
      toast.error(`Failed to update entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold">Work Log</h2>
        <span className="text-xs text-muted-foreground">{workLog.length} entries</span>
      </div>

      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <WorkLogEntryForm projectId={projectId} onSaved={onSaved} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {workLog.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries yet.</p>
        )}
        {workLog.map(entry => (
          <div key={entry.id} className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-muted-foreground">
                {new Date(entry.createdAt + 'Z').toLocaleString()}
              </p>
              {editingId !== entry.id && (
                <button
                  onClick={() => startEdit(entry)}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                  title="Edit entry"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>

            {editingId === entry.id ? (
              <div className="space-y-2">
                <textarea
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit(entry.id)
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="w-full text-sm border rounded-md px-3 py-2 resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveEdit(entry.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent text-muted-foreground"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                  <span className="text-xs text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
                </div>
              </div>
            ) : (
              <MarkdownContent>{entry.note}</MarkdownContent>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
