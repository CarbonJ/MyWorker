import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getProjectById, createProject, updateProject, deleteProject } from '@/db/projects'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { Project, DropdownOption, RagStatus } from '@/types'
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
  const [saving, setSaving] = useState(false)

  // Form state
  const [workItem, setWorkItem] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [ragStatus, setRagStatus] = useState<RagStatus>('Green')
  const [priorityId, setPriorityId] = useState<string>('')
  const [latestStatus, setLatestStatus] = useState('')
  const [productAreaId, setProductAreaId] = useState<string>('')
  const [stakeholders, setStakeholders] = useState('')
  const [linkedJiras, setLinkedJiras] = useState('')

  const load = useCallback(async () => {
    try {
      const [pris, areas] = await Promise.all([
        getDropdownOptions('priority'),
        getDropdownOptions('product_area'),
      ])
      setPriorities(pris)
      setProductAreas(areas)

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
        setStakeholders(p.stakeholders)
        setLinkedJiras(p.linkedJiras)
      }
    } catch (err) {
      console.error('Failed to load project form', err)
      toast.error(`Failed to load: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [id, isEdit, navigate])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workItem.trim()) { toast.error('Work Item is required'); return }

    setSaving(true)
    try {
      const input = {
        workItem: workItem.trim(),
        workDescription,
        ragStatus,
        priorityId: priorityId ? Number(priorityId) : null,
        latestStatus,
        productAreaId: productAreaId ? Number(productAreaId) : null,
        stakeholders,
        linkedJiras,
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
      console.error('Failed to save project', err)
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
      console.error('Failed to delete project', err)
      toast.error(`Failed to delete project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

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
            placeholder="e.g. Q3 Risk Assessment"
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

        {/* Product Area */}
        <div className={fieldClass}>
          <Label>Product Area</Label>
          <Select value={productAreaId || 'none'} onValueChange={v => setProductAreaId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select product area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {productAreas.map(a => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Latest Status */}
        <div className={fieldClass}>
          <Label htmlFor="latestStatus">Latest Status</Label>
          <Input
            id="latestStatus"
            value={latestStatus}
            onChange={e => setLatestStatus(e.target.value)}
            placeholder="Short summary for at-a-glance reporting"
          />
        </div>

        {/* Stakeholders */}
        <div className={fieldClass}>
          <Label htmlFor="stakeholders">Stakeholders</Label>
          <Input
            id="stakeholders"
            value={stakeholders}
            onChange={e => setStakeholders(e.target.value)}
            placeholder="e.g. Jane Smith, John Doe"
          />
        </div>

        {/* Linked JIRAs */}
        <div className={fieldClass}>
          <Label htmlFor="linkedJiras">Linked JIRAs</Label>
          <Input
            id="linkedJiras"
            value={linkedJiras}
            onChange={e => setLinkedJiras(e.target.value)}
            placeholder="e.g. PROJ-123, PROJ-456 or URLs"
          />
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
