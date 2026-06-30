import { useEffect, useState, useRef, startTransition } from 'react'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { toast } from 'sonner'
import { createProject, updateProject, deleteProject, getAllStakeholderNames, getAllTagNames } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus, Stakeholder } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownField } from '@/components/MarkdownField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { TagInput } from '@/components/TagInput'

interface Props {
  project?: Project | null   // null/undefined = create mode, Project = edit mode
  open: boolean
  onClose: () => void
  onSaved: (projectId: number) => void
}

export function ProjectModal({ project, open, onClose, onSaved }: Props) {
  const isEdit = !!project

  const wikiEntities = useWikiEntities()
  const [priorities, setPriorities] = useState<DropdownOption[]>([])
  const [productAreas, setProductAreas] = useState<DropdownOption[]>([])
  const [projectStatuses, setProjectStatuses] = useState<DropdownOption[]>([])
  const [saving, setSaving] = useState(false)

  // Form state
  const [workItem, setWorkItem] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [ragStatus, setRagStatus] = useState<RagStatus>('Green')
  const [priorityId, setPriorityId] = useState<string>('')
  const [latestStatus, setLatestStatus] = useState('')
  const [productAreaId, setProductAreaId] = useState<string>('')
  const [statusId, setStatusId] = useState<string>('')
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [dueDate, setDueDate] = useState<string>('')
  const [knownStakeholders, setKnownStakeholders] = useState<string[]>([])
  const [knownTags, setKnownTags] = useState<string[]>([])

  const formRef = useRef<HTMLFormElement>(null)

  // Load options when modal opens
  useEffect(() => {
    if (!open) return
    Promise.all([
      getDropdownOptions('priority'),
      getDropdownOptions('product_area'),
      getDropdownOptions('project_status'),
      getAllStakeholderNames(),
      getAllTagNames(),
    ]).then(([pris, areas, statuses, names, tagNames]) => {
      startTransition(() => {
        setPriorities(pris)
        setProductAreas(areas)
        setProjectStatuses(statuses)
        setKnownStakeholders(names)
        setKnownTags(tagNames)
      })
    })
  }, [open])

  // Populate fields when project/open changes
  useEffect(() => {
    if (project) {
      setWorkItem(project.workItem)
      setWorkDescription(project.workDescription)
      setRagStatus(project.ragStatus)
      setPriorityId(project.priorityId?.toString() ?? '')
      setLatestStatus(project.latestStatus)
      setProductAreaId(project.productAreaId?.toString() ?? '')
      setStatusId(project.statusId?.toString() ?? '')
      setStakeholders(project.stakeholders ?? [])
      setTags(project.tags ?? [])
      setDueDate(project.dueDate ?? '')
    } else {
      setWorkItem('')
      setWorkDescription('')
      setRagStatus('Green')
      setPriorityId('')
      setLatestStatus('')
      setProductAreaId('')
      setStatusId('')
      setStakeholders([])
      setTags([])
      setDueDate('')
    }
  }, [project, open])

  // Cmd+Enter / Ctrl+Enter saves the form
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workItem.trim()) { toast.error('Work Item is required'); return }
    if (!productAreaId)   { toast.error('Area is required'); return }

    setSaving(true)
    try {
      const input = {
        workItem: workItem.trim(),
        workDescription,
        ragStatus,
        priorityId: priorityId ? Number(priorityId) : null,
        latestStatus,
        productAreaId: productAreaId ? Number(productAreaId) : null,
        statusId: statusId ? Number(statusId) : null,
        stakeholders,
        tags,
        dueDate: dueDate || null,
      }

      let projectId: number
      if (isEdit && project) {
        await updateProject({ id: project.id, ...input })
        toast.success('Project updated')
        projectId = project.id
      } else {
        projectId = await createProject(input)
        toast.success('Project created')
      }
      onSaved(projectId)
      onClose()
    } catch (err) {
      toast.error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!project || !confirm(`Delete "${project.workItem}"? This cannot be undone.`)) return
    try {
      await deleteProject(project.id)
      toast.success('Project deleted')
      onClose()
      onSaved(-1)
    } catch (err) {
      toast.error(`Failed to delete project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const addStakeholder = () => setStakeholders(prev => [...prev, { name: '' }])
  const removeStakeholder = (i: number) => setStakeholders(prev => prev.filter((_, idx) => idx !== i))
  const updateStakeholder = (i: number, value: string) =>
    setStakeholders(prev => prev.map((entry, idx) => idx === i ? { name: value } : entry))

  const fieldClass = 'space-y-1.5'
  const sectionClass = 'grid grid-cols-2 gap-4'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Project' : 'New Project'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update project details below.' : 'Fill in the details to create a new project.'}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Work Item */}
          <div className={fieldClass}>
            <Label htmlFor="workItem">Work Item <span className="text-destructive">*</span></Label>
            <Input
              id="workItem"
              value={workItem}
              onChange={e => setWorkItem(e.target.value)}
              placeholder="Enter effort name"
              required
            />
          </div>

          {/* Work Description */}
          <div className={fieldClass}>
            <MarkdownField
              id="workDesc"
              label="Work Description"
              value={workDescription}
              onChange={setWorkDescription}
              placeholder="What is this project about?"
              rows={3}
              expandable
              enableWikiLinks
              wikiEntities={wikiEntities}
            />
          </div>

          {/* RAG + Priority */}
          <div className={sectionClass}>
            <div className={fieldClass}>
              <Label>RAG Status</Label>
              <Select value={ragStatus} onValueChange={v => setRagStatus(v as RagStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Green">🟢 Green</SelectItem>
                  <SelectItem value="Amber">🟡 Amber</SelectItem>
                  <SelectItem value="Red">🔴 Red</SelectItem>
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

          {/* Area + Project Status */}
          <div className={sectionClass}>
            <div className={fieldClass}>
              <Label>Area <span className="text-destructive">*</span></Label>
              <Select value={productAreaId || 'none'} onValueChange={v => setProductAreaId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {productAreas.map(a => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={fieldClass}>
              <Label>Project Status</Label>
              <Select value={statusId || 'none'} onValueChange={v => setStatusId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {projectStatuses.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status Comment */}
          <div className={fieldClass}>
            <Label htmlFor="latestStatus">Status Comment</Label>
            <Input
              id="latestStatus"
              value={latestStatus}
              onChange={e => setLatestStatus(e.target.value)}
              placeholder="Short summary for at-a-glance reporting"
            />
          </div>

          {/* Due Date */}
          <div className={fieldClass}>
            <Label>Project Due Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-44 justify-start text-left font-normal h-9">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  {dueDate ? dueDate : <span className="text-muted-foreground">Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate ? new Date(dueDate + 'T12:00:00') : undefined}
                  onSelect={d => setDueDate(d ? d.toISOString().slice(0, 10) : '')}
                  initialFocus
                />
                {dueDate && (
                  <div className="border-t p-2">
                    <button
                      type="button"
                      onClick={() => setDueDate('')}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                    >
                      Clear date
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Stakeholders */}
          <div className={fieldClass}>
            <Label>Stakeholders</Label>
            <datalist id="stakeholder-suggestions">
              {knownStakeholders.map(name => <option key={name} value={name} />)}
            </datalist>
            {stakeholders.length > 0 && (
              <div className="space-y-2">
                {stakeholders.map((entry, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      list="stakeholder-suggestions"
                      value={entry.name}
                      onChange={e => updateStakeholder(i, e.target.value)}
                      placeholder="Name"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStakeholder(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addStakeholder} className="mt-1">
              + Add Stakeholder
            </Button>
          </div>

          {/* Tags */}
          <TagInput
            id="project-modal-tags"
            value={tags}
            onChange={setTags}
            suggestions={knownTags}
          />
        </form>

        <DialogFooter className="flex items-center justify-between gap-2 pt-2">
          {isEdit && (
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete Project
            </Button>
          )}
          <p className="text-xs text-muted-foreground mr-auto">⌘/Ctrl+↵ to save</p>
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => formRef.current?.requestSubmit()} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
