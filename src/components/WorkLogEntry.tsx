import { useState } from 'react'
import { toast } from 'sonner'
import { addWorkLogEntry } from '@/db/workLog'
import { Button } from '@/components/ui/button'
import { MarkdownField } from '@/components/MarkdownField'

interface Props {
  projectId: number
  projectName?: string
  onSaved: () => void
}

export function WorkLogEntryForm({ projectId, projectName, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      const raw = note.trim()
      const text = raw.replace(/\\\[([^\]\\]+)\\\]\(([^)]+)\)/g, '[$1]($2)')
      await addWorkLogEntry(projectId, text)
      setNote('')
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
        headerLabel={projectName}
        value={note}
        onChange={setNote}
        placeholder="Add a work log entry…"
        rows={3}
        expandable
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }
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
