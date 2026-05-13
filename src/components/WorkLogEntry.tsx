import { useState } from 'react'
import { toast } from 'sonner'
import { addWorkLogEntry } from '@/db/workLog'
import { updateProject } from '@/db/projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarkdownField } from '@/components/MarkdownField'

interface Props {
  projectId: number
  latestStatus?: string
  onSaved: () => void
}

export function WorkLogEntryForm({ projectId, latestStatus, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [statusComment, setStatusComment] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      await addWorkLogEntry(projectId, note.trim())
      if (statusComment.trim()) {
        await updateProject({ id: projectId, latestStatus: statusComment.trim() })
      }
      setNote('')
      setStatusComment('')
      onSaved()
    } catch (err) {
      toast.error(`Failed to add work log entry: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <MarkdownField
        id="worklog-entry-note"
        value={note}
        onChange={setNote}
        placeholder="Add a work log entry…"
        rows={3}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e as unknown as React.FormEvent)
        }}
      />
      <Input
        value={statusComment}
        onChange={e => setStatusComment(e.target.value)}
        placeholder={latestStatus ? `Status: ${latestStatus}` : 'Update status comment… (optional)'}
        className="h-7 text-xs"
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e as unknown as React.FormEvent)
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">⌘/Ctrl+↵ to save</span>
        <Button
          type="submit"
          size="sm"
          variant="muted-dark"
          disabled={saving || !note.trim()}
          onMouseDown={e => e.preventDefault()}
        >
          {saving ? 'Saving…' : '+ Add Entry'}
        </Button>
      </div>
    </form>
  )
}
