import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createTask, updateTask, deleteTask } from '@/db/tasks'
import type { Task, TaskStatus } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  projectId: number
  task?: Task | null       // undefined/null = create mode
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function TaskModal({ projectId, task, open, onClose, onSaved }: Props) {
  const isEdit = !!task

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<TaskStatus>('open')
  const [owner, setOwner] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Populate fields when editing
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setNotes(task.notes)
      setStatus(task.status)
      setOwner(task.owner)
      setStartDate(task.startDate ?? '')
      setDueDate(task.dueDate ?? '')
    } else {
      setTitle(''); setDescription(''); setNotes('')
      setStatus('open'); setOwner(''); setStartDate(''); setDueDate('')
    }
  }, [task, open])

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const input = {
        title: title.trim(),
        description,
        notes,
        status,
        owner,
        startDate: startDate || null,
        dueDate: dueDate || null,
      }
      if (isEdit && task) {
        await updateTask({ id: task.id, ...input })
        toast.success('Task updated')
      } else {
        await createTask({ projectId, ...input })
        toast.success('Task created')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to save task', err)
      toast.error(`Failed to save task: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to delete task', err)
      toast.error(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const fieldClass = 'space-y-1.5'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className={fieldClass}>
            <Label htmlFor="task-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="task-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              rows={2}
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes, links, context…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={fieldClass}>
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={fieldClass}>
              <Label htmlFor="task-owner">Owner</Label>
              <Input
                id="task-owner"
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="Owner name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={fieldClass}>
              <Label htmlFor="task-start">Start Date</Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center">
          {isEdit && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
