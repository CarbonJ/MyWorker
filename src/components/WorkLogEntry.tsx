import { useState } from 'react'
import { toast } from 'sonner'
import { addWorkLogEntry } from '@/db/workLog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  projectId: number
  onSaved: () => void
}

export function WorkLogEntryForm({ projectId, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      await addWorkLogEntry(projectId, note.trim())
      setNote('')
      onSaved()
    } catch (err) {
      console.error('Failed to add work log entry', err)
      toast.error(`Failed to add work log entry: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Add a work log entry…"
        rows={3}
        onKeyDown={e => {
          // Ctrl/Cmd+Enter to submit
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit(e as unknown as React.FormEvent)
          // Tab to indent (insert 2 spaces at cursor instead of moving focus)
          if (e.key === 'Tab') {
            e.preventDefault()
            const el = e.currentTarget
            const start = el.selectionStart
            const end = el.selectionEnd
            const indented = note.substring(0, start) + '  ' + note.substring(end)
            setNote(indented)
            // Restore cursor position after the inserted spaces
            requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Ctrl+Enter to save</span>
        <Button type="submit" size="sm" variant="outline" disabled={saving || !note.trim()}>
          {saving ? 'Saving…' : '+ Add Entry'}
        </Button>
      </div>
    </form>
  )
}
