import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getProjectById, createProject, updateProject, deleteProject, getAllStakeholderNames } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus, JiraLink, Stakeholder } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function ProjectForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = id !== undefined

  const [project, setProject] = useState<Project | null>(null)
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
  const [linkedJiras, setLinkedJiras] = useState<JiraLink[]>([])
  const [jiraErrors, setJiraErrors] = useState<string[]>([])
  const [dueDate, setDueDate] = useState<string>('')
  const [knownStakeholders, setKnownStakeholders] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [pris, areas, statuses, names] = await Promise.all([
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
        getDropdownOptions('project_status'),
        getAllStakeholderNames(),
      ])
      setPriorities(pris)
      setProductAreas(areas)
      setProjectStatuses(statuses)
      setKnownStakeholders(names)

      if (isEdit && id) {
        const p = await getProjectById(Number(id))
        if (!p) { toast.error('Project not found'); navigate('/'); return }
        setProject(p)
        setWorkItem(p.workItem)
        setWorkDescription(p.workDescription)
        setRagStatus(p.ragStatus)
        setPriorityId(p.priorityId?.toString() ?? '')
        setLatestStatus(p.latestStatus)
        setProductAreaId(p.productAreaId?.toString() ?? '')
        setStatusId(p.statusId?.toString() ?? '')
        setStakeholders(p.stakeholders ?? [])
        setLinkedJiras(p.linkedJiras)
        setDueDate(p.dueDate ?? '')
      }
    } catch (err) {
      toast.error(`Failed to load: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [id, isEdit, navigate])

  useEffect(() => { load() }, [load])

  function validateJiraUrl(url: string): string {
    if (!url) return ''
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'URL must start with http:// or https://'
    }
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workItem.trim()) { toast.error('Work Item is required'); return }

    const errors = linkedJiras.map(j => validateJiraUrl(j.url))
    if (errors.some(e => e !== '')) {
      setJiraErrors(errors)
      toast.error('Fix JIRA URL errors before saving')
      return
    }

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
        linkedJiras,
        dueDate: dueDate || null,
      }

      if (isEdit && id) {
        await updateProject({ id: Number(id), ...input })
        toast.success('Project updated')
        navigate(`/projects/${id}`)
      } else {
        const newId = await createProject(input)
        toast.success('Project created')
        navigate(`/projects/${newId}`)
      }
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
      navigate('/')
    } catch (err) {
      toast.error(`Failed to delete project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const addStakeholder = () =>
    setStakeholders(prev => [...prev, { name: '' }])

  const removeStakeholder = (index: number) =>
    setStakeholders(prev => prev.filter((_, i) => i !== index))

  const updateStakeholder = (index: number, value: string) =>
    setStakeholders(prev =>
      prev.map((entry, i) => i === index ? { name: value } : entry)
    )

  const addJiraLink = () =>
    setLinkedJiras(prev => [...prev, { url: '', label: '' }])

  const removeJiraLink = (index: number) => {
    setLinkedJiras(prev => prev.filter((_, i) => i !== index))
    setJiraErrors(prev => prev.filter((_, i) => i !== index))
  }

  const updateJiraLink = (index: number, field: 'url' | 'label', value: string) =>
    setLinkedJiras(prev =>
      prev.map((entry, i) => i === index ? { ...entry, [field]: value } : entry)
    )

  const fieldClass = 'space-y-1.5'
  const sectionClass = 'grid grid-cols-2 gap-4'

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{isEdit ? 'Edit Project' : 'New Project'}</h1>
        <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
          <Label htmlFor="workDesc">Work Description</Label>
          <Textarea
            id="workDesc"
            value={workDescription}
            onChange={e => setWorkDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={3}
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
            <Label>Area</Label>
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
          <Label htmlFor="dueDate">Project Due Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-44"
          />
        </div>

        {/* Stakeholders */}
        <div className={fieldClass}>
          <Label>Stakeholders</Label>
          {/* Datalist for autocomplete suggestions */}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStakeholder}
            className="mt-1"
          >
            + Add Stakeholder
          </Button>
        </div>

        {/* Linked JIRAs */}
        <div className={fieldClass}>
          <Label>Linked JIRAs</Label>
          {linkedJiras.length > 0 && (
            <div className="space-y-2">
              {linkedJiras.map((entry, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={entry.label}
                      onChange={e => updateJiraLink(i, 'label', e.target.value)}
                      placeholder="Label (e.g. PROJ-123)"
                      className="w-36 shrink-0"
                    />
                    <Input
                      value={entry.url}
                      onChange={e => updateJiraLink(i, 'url', e.target.value)}
                      onBlur={() => setJiraErrors(prev => {
                        const next = [...prev]
                        next[i] = validateJiraUrl(entry.url)
                        return next
                      })}
                      placeholder="https://..."
                      className={`flex-1 ${jiraErrors[i] ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeJiraLink(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                  {jiraErrors[i] && (
                    <p className="text-xs text-destructive pl-[9.5rem]">{jiraErrors[i]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addJiraLink}
            className="mt-1"
          >
            + Add JIRA link
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          {isEdit && (
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete Project
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
