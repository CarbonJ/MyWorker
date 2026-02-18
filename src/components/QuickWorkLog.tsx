import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getAllProjects } from '@/db/projects'
import { addWorkLogEntry } from '@/db/workLog'
import type { Project } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface Props {
  defaultProjectId?: number
}

export function QuickWorkLogButton({ defaultProjectId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Global floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-primary/90 transition-colors z-50"
        title="Quick work log entry"
      >
        +
      </button>

      <QuickWorkLogModal
        open={open}
        onClose={() => setOpen(false)}
        defaultProjectId={defaultProjectId}
      />
    </>
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  defaultProjectId?: number
}

function QuickWorkLogModal({ open, onClose, defaultProjectId }: ModalProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    getAllProjects().then(ps => {
      setProjects(ps)
      if (defaultProjectId) setProjectId(defaultProjectId.toString())
      else if (ps.length > 0) setProjectId(ps[0].id.toString())
    })
    setNote('')
  }, [open, defaultProjectId])

  const handleSave = async () => {
    if (!projectId || !note.trim()) return
    setSaving(true)
    try {
      await addWorkLogEntry(Number(projectId), note.trim())
      toast.success('Work log entry added')
      onClose()
    } catch {
      toast.error('Failed to add entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Work Log Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.workItem}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What did you work on?"
              rows={4}
              autoFocus
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
              }}
            />
            <p className="text-xs text-muted-foreground">Ctrl+Enter to save</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !note.trim() || !projectId}>
            {saving ? 'Saving…' : 'Add Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
