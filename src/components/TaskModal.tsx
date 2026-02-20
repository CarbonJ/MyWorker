import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createTask, updateTask, deleteTask } from '@/db/tasks'
import { getAllProjects } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Task, TaskStatus, DropdownOption, Project } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ChevronsUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId?: number | null   // initial project; undefined = no default
  task?: Task | null          // undefined/null = create mode
  open: boolean
  onClose: () => void
  onSaved: () => void
  projects?: Project[]        // optional pre-loaded list (avoids extra fetch)
}

export function TaskModal({ projectId: initialProjectId, task, open, onClose, onSaved, projects: propProjects }: Props) {
  const isEdit = !!task

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [notes,       setNotes]       = useState('')
  const [status,      setStatus]      = useState<TaskStatus>('open')
  const [priorityId,  setPriorityId]  = useState<string>('')
  const [startDate,   setStartDate]   = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [saving,      setSaving]      = useState(false)

  // Project combobox state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projects,           setProjects]           = useState<Project[]>(propProjects ?? [])
  const [projectOpen,        setProjectOpen]        = useState(false)
  const [projectSearch,      setProjectSearch]      = useState('')

  const [priorities, setPriorities] = useState<DropdownOption[]>([])

  // Load options whenever modal opens
  useEffect(() => {
    if (!open) return
    getDropdownOptions('priority').then(setPriorities)
    // Only fetch projects if they weren't passed in as a prop
    if (!propProjects) {
      getAllProjects().then(setProjects)
    }
  }, [open, propProjects])

  // Sync propProjects if parent updates them
  useEffect(() => {
    if (propProjects) setProjects(propProjects)
  }, [propProjects])

  // Populate fields when task/open changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setNotes(task.notes)
      setStatus(task.status)
      setPriorityId(task.priorityId?.toString() ?? '')
      setStartDate(task.startDate ?? '')
      setDueDate(task.dueDate ?? '')
      setSelectedProjectId(task.projectId)
    } else {
      setTitle(''); setDescription(''); setNotes('')
      setStatus('open'); setPriorityId(''); setStartDate(''); setDueDate('')
      setSelectedProjectId(initialProjectId ?? null)
    }
    setProjectSearch('')
    setProjectOpen(false)
  }, [task, open, initialProjectId])

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const input = {
        projectId: selectedProjectId,
        title: title.trim(),
        description,
        notes,
        status,
        priorityId: priorityId ? Number(priorityId) : null,
        startDate: startDate || null,
        dueDate: dueDate || null,
      }
      if (isEdit && task) {
        await updateTask({ id: task.id, ...input })
        toast.success('Task updated')
      } else {
        await createTask(input)
        toast.success('Task created')
      }
      onSaved()
      onClose()
    } catch (err) {
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
      toast.error(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** Insert 2 spaces at cursor on Tab instead of moving focus */
  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, setter: (v: string) => void) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    setter(value.substring(0, start) + '  ' + value.substring(end))
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const filteredProjects = projectSearch.trim()
    ? projects.filter(p => p.workItem.toLowerCase().includes(projectSearch.toLowerCase()))
    : projects

  const fieldClass = 'space-y-1.5'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Edit task details' : 'Create a new task'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
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

          {/* Project picker */}
          <div className={fieldClass}>
            <Label>Project</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={projectOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn('truncate', !selectedProject && 'text-muted-foreground')}>
                    {selectedProject ? selectedProject.workItem : 'Inbox (no project)'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search projects…"
                    value={projectSearch}
                    onValueChange={setProjectSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No projects found.</CommandEmpty>
                    <CommandGroup>
                      {/* Inbox option */}
                      <CommandItem
                        value="__inbox__"
                        onSelect={() => {
                          setSelectedProjectId(null)
                          setProjectOpen(false)
                          setProjectSearch('')
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedProjectId === null ? 'opacity-100' : 'opacity-0')} />
                        <span className="italic text-muted-foreground">Inbox (no project)</span>
                      </CommandItem>
                      {filteredProjects.map(p => (
                        <CommandItem
                          key={p.id}
                          value={String(p.id)}
                          onSelect={() => {
                            setSelectedProjectId(p.id)
                            setProjectOpen(false)
                            setProjectSearch('')
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', selectedProjectId === p.id ? 'opacity-100' : 'opacity-0')} />
                          {p.workItem}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Description */}
          <div className={fieldClass}>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => handleTabKey(e, description, setDescription)}
              placeholder="What needs to be done? (supports Markdown)"
              rows={2}
            />
          </div>

          {/* Notes */}
          <div className={fieldClass}>
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onKeyDown={e => handleTabKey(e, notes, setNotes)}
              placeholder="Additional notes, links, context… (supports Markdown)"
              rows={2}
            />
          </div>

          {/* Status + Priority */}
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
              <Label>Priority</Label>
              <Select value={priorityId || 'none'} onValueChange={v => setPriorityId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {priorities.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
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
          <p className="text-xs text-muted-foreground mr-auto">⌘↵ to save</p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
