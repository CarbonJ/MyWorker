/**
 * WorkLogPane — right pane of ProjectDetail.
 *
 * Shows the chronological list of work log entries (newest first) and
 * an inline form to add new entries. Each entry has a pencil icon that
 * switches it to edit mode; the created_at timestamp is preserved on save.
 * Entries can also be deleted via the trash icon.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { WorkLogEntry } from '@/types'
import { updateWorkLogEntry, deleteWorkLogEntry } from '@/db/workLog'
import { WorkLogEntryForm } from '@/components/WorkLogEntry'
import { MarkdownContent } from '@/components/MarkdownContent'
import { MarkdownField } from '@/components/MarkdownField'
import { Pencil, Trash2 } from 'lucide-react'
import { loadGuiSettings, altRowStyle } from '@/lib/guiSettings'

interface Props {
  projectId: number
  workLog: WorkLogEntry[]
  onSaved: () => void
}

export function WorkLogPane({ projectId, workLog, onSaved }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const { rowColor, rowOpacity } = loadGuiSettings()

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
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold">Work Log</h2>
        <span className="text-xs text-muted-foreground">{workLog.length} entries</span>
      </div>

      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <WorkLogEntryForm projectId={projectId} onSaved={onSaved} />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
        {workLog.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No entries yet. Add one above to get started.</p>
        )}
        {workLog.map((entry, index) => (
          <div key={entry.id} className="px-4 py-3" style={altRowStyle(rowColor, rowOpacity, index)}>
            <div className="flex items-center gap-1.5 mb-1">
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
                  value={editDraft}
                  onChange={setEditDraft}
                  rows={3}
                  initialFocused
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit(entry.id)
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
              <MarkdownContent>{entry.note}</MarkdownContent>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
