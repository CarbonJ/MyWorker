import { useState } from 'react'
import { toast } from 'sonner'
import { addWorkLogEntry } from '@/db/workLog'
import { Button } from '@/components/ui/button'
import { MarkdownField } from '@/components/MarkdownField'
import { useWikiEntities } from '@/hooks/useWikiEntities'

interface Props {
  projectId: number
  projectName?: string
  onSaved: () => void
}

// Unsent entry text is kept per project so leaving the screen (or a reload) never
// loses it. Not under the myworker: prefix — drafts stay out of backups.
const draftKey = (projectId: number) => `myworker-draft:worklog:${projectId}`

function loadDraft(projectId: number): string {
  try { return localStorage.getItem(draftKey(projectId)) ?? '' } catch { return '' }
}

function saveDraft(projectId: number, text: string): void {
  try {
    if (text.trim()) localStorage.setItem(draftKey(projectId), text)
    else localStorage.removeItem(draftKey(projectId))
  } catch { /* storage unavailable — the draft just isn't kept */ }
}

export function WorkLogEntryForm({ projectId, projectName, onSaved }: Props) {
  const [note, setNoteState] = useState(() => loadDraft(projectId))
  const setNote = (text: string) => {
    setNoteState(text)
    saveDraft(projectId, text)
  }
  const [saving, setSaving] = useState(false)
  // Expand button renders above the Add Entry button instead of in its own header line
  const [expandSlot, setExpandSlot] = useState<HTMLDivElement | null>(null)
  const wikiEntities = useWikiEntities()

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
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1 min-w-0">
        <MarkdownField
          id="worklog-entry-note"
          headerLabel={projectName}
          value={note}
          onChange={setNote}
          placeholder="Add a work log entry…"
          rows={2}
          expandable
          expandSlot={expandSlot}
          enableWikiLinks
          wikiEntities={wikiEntities}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }
          }}
        />
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div ref={setExpandSlot} className="flex" />
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
