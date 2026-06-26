/**
 * ProjectHeader — top pane of ProjectDetail.
 *
 * Displays the project title, description, and metadata (RAG, priority,
 * status, stakeholders, JIRAs). Handles inline editing of Latest Status,
 * and inline popover editing of RAG, Priority, and Project Status.
 */

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project, DropdownOption, Task, RagStatus } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ProjectStats } from '@/components/project/ProjectStats'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { pillClass, dotClass } from '@/lib/colors'
import { DESC_EXPAND_CHAR_THRESHOLD, DESC_EXPAND_LINE_THRESHOLD } from '@/lib/constants'

const COLLAPSED_KEY = 'myworker:header-collapsed'

interface Props {
  project: Project
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  tasks: Task[]
  isArchived: boolean
  onSaveField: (patch: Partial<Omit<Project, 'id'>>) => void
  onMarkComplete: () => void
  onReopen: () => void
  onEdit: () => void
}


export function ProjectHeader({
  project, priorities, productAreas, projectStatuses, tasks,
  isArchived, onSaveField, onMarkComplete, onReopen, onEdit,
}: Props) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  const [descExpanded, setDescExpanded] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState('')
  const statusInputRef = useRef<HTMLInputElement>(null)

  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c
    localStorage.setItem(COLLAPSED_KEY, String(next))
    return next
  })

  const openStatusEdit = () => {
    setStatusDraft(project.latestStatus)
    setEditingStatus(true)
    setTimeout(() => statusInputRef.current?.focus(), 0)
  }

  const commitStatus = () => {
    setEditingStatus(false)
    if (statusDraft !== project.latestStatus) {
      onSaveField({ latestStatus: statusDraft })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const isProjectOverdue = !isArchived && !!project.dueDate && project.dueDate < today

  const RAG_OPTIONS: { value: RagStatus; label: string; color: string }[] = [
    { value: 'Green', label: 'Green', color: 'bg-green-500' },
    { value: 'Amber', label: 'Amber', color: 'bg-amber-400' },
    { value: 'Red',   label: 'Red',   color: 'bg-red-500' },
  ]

  // ── Collapsed bar ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="shrink-0 px-6 py-2 border-b bg-background flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground shrink-0">
          ← Back
        </button>
        <span className="text-sm font-semibold truncate">{project.workItem}</span>
        <RagBadge status={project.ragStatus} />
        {project.latestStatus && (
          <span className="text-sm text-muted-foreground truncate hidden md:block">{project.latestStatus}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {isArchived ? (
            <Button size="sm" variant="outline" onClick={onReopen} className="text-green-700 border-green-300 hover:bg-green-50">
              ↩ Reopen
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onMarkComplete} className="text-slate-600 hover:text-green-700 hover:border-green-300">
              ✓ Mark Complete
            </Button>
          )}
          <button onClick={toggleCollapsed} title="Expand header" className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── Full header ───────────────────────────────────────────────────────────
  return (
    <div className="shrink-0 px-6 py-4 border-b bg-background">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <button onClick={toggleCollapsed} title="Collapse header" className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      {isProjectOverdue && (
        <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <span>🗓</span>
          <span className="font-semibold">Project overdue</span>
          <span className="text-red-600">— due {new Date(project.dueDate! + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_1fr_14rem] gap-6">

        {/* LEFT: Work Item + Description */}
        <div className="min-w-0 space-y-2 border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold truncate">{project.workItem}</h1>
            <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0">
              Edit
            </Button>
            {isArchived ? (
              <Button size="sm" variant="outline" onClick={onReopen} className="shrink-0 text-green-700 border-green-300 hover:bg-green-50">
                ↩ Reopen
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onMarkComplete} className="shrink-0 text-slate-600 hover:text-green-700 hover:border-green-300">
                ✓ Mark Complete
              </Button>
            )}
          </div>
          {project.workDescription && (
            <div>
              <div className={descExpanded ? undefined : 'line-clamp-3'}>
                <MarkdownContent className="text-sm text-muted-foreground">{project.workDescription}</MarkdownContent>
              </div>
              {(project.workDescription.length > DESC_EXPAND_CHAR_THRESHOLD || project.workDescription.split('\n').length > DESC_EXPAND_LINE_THRESHOLD) && (
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground mt-0.5"
                >
                  {descExpanded ? 'Show less ↑' : 'Show more ↓'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* MIDDLE: Metadata */}
        <div className="space-y-3 text-sm border rounded-lg p-3">
          {/* Latest Status — click to edit inline */}
          <div
            className="px-3 py-4 bg-muted rounded-md cursor-text"
            onClick={() => !editingStatus && openStatusEdit()}
          >
            <span className="font-medium">Status: </span>
            {editingStatus ? (
              <Input
                ref={statusInputRef}
                value={statusDraft}
                onChange={e => setStatusDraft(e.target.value)}
                onBlur={commitStatus}
                onKeyDown={e => { if (e.key === 'Enter') commitStatus(); if (e.key === 'Escape') setEditingStatus(false) }}
                className="h-6 px-1 py-0 text-sm border-0 shadow-none bg-transparent focus-visible:ring-0 inline-block w-full"
              />
            ) : (
              <span className="text-muted-foreground">{project.latestStatus || <span className="italic text-muted-foreground/60">click to add…</span>}</span>
            )}
          </div>

          {/* RAG + Priority + Area + Project Status — all inline-editable */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* RAG — popover editor */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity cursor-pointer" title="Click to change RAG status">
                  <RagBadge status={project.ragStatus} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="start">
                {RAG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onSaveField({ ragStatus: opt.value })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${project.ragStatus === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Priority — popover editor */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity cursor-pointer" title="Click to change priority">
                  {project.priorityId ? (() => {
                    const opt = priorities.find(o => o.id === project.priorityId)
                    const color = opt?.color ?? ''
                    return (
                      <span className={`text-xs inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border ${pillClass(color)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass(color)}`} />
                        {opt?.label ?? '—'}
                      </span>
                    )
                  })() : <span className="text-xs text-muted-foreground border border-dashed rounded-full px-2 py-0.5">Priority</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                <button
                  onClick={() => onSaveField({ priorityId: null })}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                >
                  <Check className={`h-3 w-3 shrink-0 ${project.priorityId === null ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-muted-foreground">— None</span>
                </button>
                {priorities.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => onSaveField({ priorityId: opt.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${project.priorityId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Project Status — popover editor */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:opacity-75 transition-opacity cursor-pointer" title="Click to change status">
                  {project.statusId ? (() => {
                    const opt = projectStatuses.find(s => s.id === project.statusId)
                    if (!opt) return <span className="text-xs text-muted-foreground border border-dashed rounded-full px-2 py-0.5">Status</span>
                    return (
                      <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${pillClass(opt.color)}`}>
                        {opt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                        {opt.label}
                      </span>
                    )
                  })() : <span className="text-xs text-muted-foreground border border-dashed rounded-full px-2 py-0.5">Status</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                <button
                  onClick={() => onSaveField({ statusId: null })}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                >
                  <Check className={`h-3 w-3 shrink-0 ${project.statusId === null ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-muted-foreground">— None</span>
                </button>
                {projectStatuses.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => onSaveField({ statusId: opt.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                  >
                    <Check className={`h-3 w-3 shrink-0 ${project.statusId === opt.id ? 'opacity-100' : 'opacity-0'}`} />
                    {opt.color && <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Area — display only (inherited from project) */}
            {project.productAreaId && (() => {
              const opt = productAreas.find(o => o.id === project.productAreaId)
              const color = opt?.color ?? ''
              return (
                <span className={`text-xs inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border ${pillClass(color)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass(color)}`} />
                  {opt?.label ?? '—'}
                </span>
              )
            })()}
          </div>

          {project.stakeholders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="font-medium text-foreground text-sm">Stakeholders:</span>
              {project.stakeholders.map((s, i) => (
                <span key={i} className="bg-white border rounded-full px-2.5 py-0.5 text-xs text-slate-900 shadow-sm">
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {project.linkedJiras.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="font-medium text-foreground text-sm">JIRAs:</span>
              {project.linkedJiras.map((j, i) => (
                <a
                  key={i}
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border rounded-full px-2.5 py-0.5 text-xs text-blue-600 hover:text-blue-800 shadow-sm"
                >
                  {j.label || j.url}
                </a>
              ))}
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Stats & Metrics */}
        <ProjectStats tasks={tasks} project={project} />

      </div>
    </div>
  )
}
