import { useEffect, useRef, useState, startTransition } from 'react'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { toast } from 'sonner'
import { createTask, updateTask, deleteTask, logTaskStatusChange } from '@/db/tasks'
import { RecurringCompleteDialog } from '@/components/RecurringCompleteDialog'
import { getAllProjects, getAllTagNames } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Task, TaskStatus, DropdownOption, Project } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownField } from '@/components/MarkdownField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Calendar } from '@/components/ui/calendar'
import { ChevronsUpDown, Check, X, CalendarIcon } from 'lucide-react'
import { cn, fmtDate, localToday, nextDayShortcut, toLocalDateString } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { TagInput } from '@/components/TagInput'

interface Props {
  projectId?: number | null            // initial project; undefined = no default
  initialProductAreaId?: number | null // initial area (used by CMD+L when area filter active)
  task?: Task | null                   // undefined/null = create mode
  open: boolean
  onClose: () => void
  onSaved: () => void
  projects?: Project[]                 // optional pre-loaded list (avoids extra fetch)
}

export function TaskModal({ projectId: initialProjectId, initialProductAreaId, task, open, onClose, onSaved, projects: propProjects }: Props) {
  const isEdit = !!task
  const wikiEntities = useWikiEntities()

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [notes,       setNotes]       = useState('')
  const [status,      setStatus]      = useState<TaskStatus>('open')
  const [priorityId,  setPriorityId]  = useState<string>('')
  const [startDate,   setStartDate]   = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [tags,        setTags]        = useState<string[]>([])
  const [isRecurring, setIsRecurring] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [knownTags,   setKnownTags]   = useState<string[]>([])

  // Project combobox state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projects,           setProjects]           = useState<Project[]>(propProjects ?? [])
  const [projectOpen,        setProjectOpen]        = useState(false)
  const [projectSearch,      setProjectSearch]      = useState('')

  const [priorities,    setPriorities]    = useState<DropdownOption[]>([])
  const [productAreas,  setProductAreas]  = useState<DropdownOption[]>([])
  const [productAreaId, setProductAreaId] = useState<string>('')

  // Load options whenever modal opens.
  // startTransition defers these setState calls so they can't interrupt an
  // in-progress dropdown interaction and confuse Radix UI's pointer-events counter.
  useEffect(() => {
    if (!open) return
    getDropdownOptions('priority').then(data => startTransition(() => setPriorities(data)))
    getDropdownOptions('product_area').then(data => startTransition(() => setProductAreas(data)))
    getAllTagNames().then(data => startTransition(() => setKnownTags(data)))
    if (!propProjects) {
      getAllProjects().then(data => startTransition(() => setProjects(data)))
    }
  }, [open, propProjects])

  // Sync propProjects if parent updates them
  useEffect(() => {
    if (propProjects) setProjects(propProjects)
  }, [propProjects])

  // What the form held when it opened, as one comparable value — used to tell
  // whether closing it would throw away changes. Same field order as formSnapshot.
  const initialFormRef = useRef<string | null>(null)

  // Populate fields when task/open changes
  useEffect(() => {
    const init = task ? {
      title: task.title, description: task.description, notes: task.notes,
      status: task.status,
      priorityId: task.priorityId?.toString() ?? '',
      productAreaId: task.productAreaId?.toString() ?? '',
      tags: task.tags ?? [],
      startDate: task.startDate ?? '', dueDate: task.dueDate ?? '',
      isRecurring: task.isRecurring,
      selectedProjectId: task.projectId,
    } : {
      title: '', description: '', notes: '',
      status: 'open' as TaskStatus,
      priorityId: '',
      productAreaId: initialProductAreaId ? String(initialProductAreaId) : '',
      tags: [] as string[],
      startDate: '', dueDate: '',
      isRecurring: false,
      selectedProjectId: initialProjectId ?? null,
    }
    setTitle(init.title); setDescription(init.description); setNotes(init.notes)
    setStatus(init.status); setPriorityId(init.priorityId)
    setProductAreaId(init.productAreaId)
    setTags(init.tags)
    setStartDate(init.startDate); setDueDate(init.dueDate)
    setIsRecurring(init.isRecurring)
    setSelectedProjectId(init.selectedProjectId)
    setProjectSearch('')
    setProjectOpen(false)
    initialFormRef.current = JSON.stringify([
      init.title, init.description, init.notes, init.status, init.priorityId, init.productAreaId,
      init.tags, init.startDate, init.dueDate, init.isRecurring, init.selectedProjectId,
    ])
  }, [task, open, initialProjectId, initialProductAreaId])

  const formSnapshot = JSON.stringify([
    title, description, notes, status, priorityId, productAreaId, tags, startDate, dueDate, isRecurring, selectedProjectId,
  ])

  /** Close without saving — asks first if there are unsaved changes. */
  const requestClose = () => {
    const dirty = initialFormRef.current !== null && initialFormRef.current !== formSnapshot
    if (dirty && !confirm('Discard your unsaved changes to this task?')) return
    onClose()
  }

  // A recurring task being set to Done from this form: the form closes and the
  // same "next due date" prompt the status circle uses takes over.
  const [recurringPrompt, setRecurringPrompt] = useState<Task | null>(null)

  const finishRecurring = async (apply: (t: Task) => Promise<void>) => {
    const t = recurringPrompt
    if (!t) return
    try {
      await apply(t)
      window.dispatchEvent(new Event('myworker:task-saved'))
      onSaved()
    } catch (err) {
      toast.error(`Failed to update task: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRecurringPrompt(null)
    }
  }

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const input = {
        projectId: selectedProjectId,
        // Only send productAreaId for non-project tasks; DB layer also enforces this
        productAreaId: selectedProjectId ? null : (productAreaId ? Number(productAreaId) : null),
        title: title.trim(),
        description,
        notes,
        status,
        priorityId: priorityId ? Number(priorityId) : null,
        tags,
        startDate: startDate || null,
        dueDate: dueDate || null,
        isRecurring,
      }
      if (isEdit && task) {
        if (status === 'done' && task.status !== 'done' && isRecurring) {
          // Save the other edits now; the prompt decides the status and next due date
          await updateTask({ id: task.id, ...input, status: task.status })
          setRecurringPrompt({ ...task, ...input, status: task.status })
          onSaved()
          onClose()
          return
        }
        await updateTask({ id: task.id, ...input })
        await logTaskStatusChange(input, task.status, status)
        toast.success('Task updated')
      } else {
        await createTask(input)
        // A task created already started or finished is logged like any other status change
        await logTaskStatusChange(input, 'open', status)
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
    if (!task || !confirm(`Delete "${task.title}"? It moves to the Trash, where you can restore it for 30 days.`)) return
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)
  // When a project is selected, show the area it inherits from that project (read-only)
  const inheritedArea = selectedProject
    ? productAreas.find(a => a.id === selectedProject.productAreaId)
    : null

  // Scope project list to the selected area (only when no project is already chosen)
  const projectsForArea = productAreaId && !selectedProjectId
    ? projects.filter(p => p.productAreaId === Number(productAreaId))
    : projects

  const filteredProjects = projectSearch.trim()
    ? projectsForArea.filter(p => p.workItem.toLowerCase().includes(projectSearch.toLowerCase()))
    : projectsForArea

  // Reset project if area changes and the chosen project is no longer in scope
  useEffect(() => {
    if (!selectedProjectId || !productAreaId) return
    const proj = projects.find(p => p.id === selectedProjectId)
    if (proj && proj.productAreaId !== Number(productAreaId)) {
      setSelectedProjectId(null)
    }
  }, [productAreaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fieldClass = 'space-y-1.5'

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && requestClose()}>
      <DialogContent
        className="max-w-2xl flex flex-col max-h-[90vh]"
        // Prevent Radix from treating clicks inside Select/Popover portals (rendered
        // outside the Dialog DOM) as "interact outside" — that path triggers dialog-close
        // cleanup which can leave body pointer-events stuck and freeze the form.
        onInteractOutside={e => e.preventDefault()}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Edit task details' : 'Create a new task'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 overflow-y-auto overflow-x-hidden min-w-0 flex-1 min-h-0">
          {/* Title */}
          <div className={fieldClass}>
            <Label htmlFor="task-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="task-title"
              spellCheck
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
            />
          </div>

          {/* Area + Project on one row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Area — editable when no project selected; inherited (read-only) when project selected */}
            <div className={cn(fieldClass, 'min-w-0')}>
              <Label>Area</Label>
              {selectedProjectId !== null ? (
                <p className="text-sm text-muted-foreground h-9 flex items-center px-3 rounded-md border border-input bg-muted/40 truncate">
                  {inheritedArea ? inheritedArea.label : <span className="italic">None (inherited from project)</span>}
                </p>
              ) : (
                <Select value={productAreaId || 'none'} onValueChange={v => setProductAreaId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="none">— Inbox (no area)</SelectItem>
                    {productAreas.map(a => (
                      <SelectItem key={a.id} value={a.id.toString()}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Project picker */}
            <div className={cn(fieldClass, 'min-w-0')}>
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
                <PopoverContent className="w-[--radix-popover-trigger-width] min-w-80 p-0" align="start">
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
          </div>

          {/* Description */}
          <MarkdownField
            id="task-desc"
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What needs to be done?"
            rows={3}
            enableWikiLinks
            wikiEntities={wikiEntities}
          />

          {/* Notes */}
          <MarkdownField
            id="task-notes"
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Additional notes, links, context…"
            rows={6}
            expandable
            enableWikiLinks
            wikiEntities={wikiEntities}
          />

          {/* Status + Priority + Recurring */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className={fieldClass}>
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
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
                <SelectContent position="popper">
                  <SelectItem value="none">—</SelectItem>
                  {priorities.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className="flex items-center gap-2.5 h-9"
              title="When completed, prompts for the next due date"
            >
              <Checkbox
                id="task-recurring"
                checked={isRecurring}
                onCheckedChange={v => setIsRecurring(!!v)}
              />
              <Label htmlFor="task-recurring" className="cursor-pointer font-normal">
                Recurring task
              </Label>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className={fieldClass}>
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-9">
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    {startDate ? startDate : <span className="text-muted-foreground">Pick a date</span>}
                    {startDate && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setStartDate('') }}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="Clear start date"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? new Date(startDate + 'T12:00:00') : undefined}
                    onSelect={d => setStartDate(d ? toLocalDateString(d) : '')}
                    initialFocus
                  />
                  <div className="border-t px-3 py-2 flex gap-2">
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setStartDate('')}>Clear</button>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setStartDate(localToday())}>Today</button>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setStartDate(nextDayShortcut().date)}>{nextDayShortcut().label}</button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className={fieldClass}>
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start text-left font-normal h-9">
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    {dueDate ? dueDate : <span className="text-muted-foreground">Pick a date</span>}
                    {dueDate && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setDueDate('') }}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        aria-label="Clear due date"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ? new Date(dueDate + 'T12:00:00') : undefined}
                    onSelect={d => setDueDate(d ? toLocalDateString(d) : '')}
                    initialFocus
                  />
                  <div className="border-t px-3 py-2 flex gap-2">
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setDueDate('')}>Clear</button>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setDueDate(localToday())}>Today</button>
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex-1 text-center" onClick={() => setDueDate(nextDayShortcut().date)}>{nextDayShortcut().label}</button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Tags */}
          <TagInput
            id="task-tags"
            value={tags}
            onChange={setTags}
            suggestions={knownTags}
          />
        </div>

        <DialogFooter className="flex items-center shrink-0">
          {isEdit && (
            <Button variant="destructive" onClick={handleDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <p className="text-xs text-muted-foreground mr-auto">⌘/Ctrl+↵ to save</p>
          <Button variant="outline" onClick={requestClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {recurringPrompt && (
      <RecurringCompleteDialog
        task={recurringPrompt}
        open
        onReschedule={(newDueDate, note) => finishRecurring(async t => {
          await updateTask({ id: t.id, status: 'open', dueDate: newDueDate })
          await logTaskStatusChange(t, t.status, 'done', `. Next due: ${fmtDate(newDueDate)}${note ? `. ${note}` : ''}`)
        })}
        onMarkDone={() => finishRecurring(async t => {
          await updateTask({ id: t.id, status: 'done', isRecurring: false })
          await logTaskStatusChange(t, t.status, 'done')
        })}
        onCancel={() => setRecurringPrompt(null)}
      />
    )}
    </>
  )
}
