/**
 * RecurringCompleteDialog
 *
 * Shown when a recurring task is cycled to "done". Instead of silently
 * marking it done, this dialog asks the user for the next due date, then
 * resets the task to open. The user can also choose to mark it done
 * permanently (which also clears the recurring flag).
 */

import { useState } from 'react'
import type { Task } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { RefreshCw } from 'lucide-react'

interface Props {
  task: Task
  open: boolean
  onReschedule: (newDueDate: string, note: string) => Promise<void>
  onMarkDone: () => Promise<void>
  onCancel: () => void
}

export function RecurringCompleteDialog({ task, open, onReschedule, onMarkDone, onCancel }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleReschedule = async () => {
    if (!selectedDate) return
    setSaving(true)
    try {
      await onReschedule(selectedDate.toISOString().slice(0, 10), note.trim())
    } finally {
      setSaving(false)
      setSelectedDate(undefined)
      setNote('')
    }
  }

  const handleMarkDone = async () => {
    setSaving(true)
    try {
      await onMarkDone()
    } finally {
      setSaving(false)
      setSelectedDate(undefined)
      setNote('')
    }
  }

  const handleCancel = () => {
    setSelectedDate(undefined)
    setNote('')
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-500" />
            Task Complete
          </DialogTitle>
          <DialogDescription className="text-sm">
            <span className="font-medium text-foreground">{task.title}</span>
            <br />
            Schedule the next occurrence, or mark it done permanently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Next due date picker */}
          <div className="space-y-1.5">
            <Label>Next due date <span className="text-destructive">*</span></Label>
            <div className="rounded-md border">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
              <div className="border-t px-3 py-2 flex gap-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </button>
                {selectedDate && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Optional completion note */}
          <div className="space-y-1.5">
            <Label htmlFor="recur-note">Completion note <span className="text-xs text-muted-foreground">(optional — added to work log)</span></Label>
            <Textarea
              id="recur-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What was completed? Any context for the next run?"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleReschedule}
            disabled={!selectedDate || saving}
            className="w-full"
          >
            {saving ? 'Saving…' : 'Reschedule & reopen'}
          </Button>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={handleCancel} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button variant="ghost" onClick={handleMarkDone} disabled={saving} className="flex-1 text-muted-foreground hover:text-foreground">
              Mark done (stop recurring)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
