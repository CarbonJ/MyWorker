/**
 * ProjectHeader — top pane of ProjectDetail.
 *
 * Displays the project title, description, and metadata (RAG, priority,
 * status, stakeholders, JIRAs). Handles inline editing of Latest Status.
 */

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project, DropdownOption, Task } from '@/types'
import { RagBadge } from '@/components/RagBadge'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ProjectStats } from '@/components/project/ProjectStats'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pillClass, dotClass } from '@/lib/colors'
import { DESC_EXPAND_CHAR_THRESHOLD, DESC_EXPAND_LINE_THRESHOLD } from '@/lib/constants'

interface Props {
  project: Project
  projectId: number
  priorities: DropdownOption[]
  productAreas: DropdownOption[]
  projectStatuses: DropdownOption[]
  tasks: Task[]
  isArchived: boolean
  onSaveField: (patch: Partial<Omit<Project, 'id'>>) => void
  onMarkComplete: () => void
  onReopen: () => void
}

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* invalid URL */ }
  return null
}


export function ProjectHeader({
  project, projectId, priorities, productAreas, projectStatuses, tasks,
  isArchived, onSaveField, onMarkComplete, onReopen,
}: Props) {
  const navigate = useNavigate()
  const [descExpanded, setDescExpanded] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState('')
  const statusInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="shrink-0 px-6 py-4 border-b bg-background">
      <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground mb-3 block">
        ← Projects
      </button>

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
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}/edit`)} className="shrink-0">
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

        {/* RIGHT: Metadata */}
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

          {/* RAG + Priority + Area + Project Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <RagBadge status={project.ragStatus} />
            {project.priorityId && (() => {
              const opt = priorities.find(o => o.id === project.priorityId)
              const color = opt?.color ?? ''
              return (
                <span className={`text-xs inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border ${pillClass(color)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotClass(color)}`} />
                  {opt?.label ?? '—'}
                </span>
              )
            })()}
            {project.statusId && (() => {
              const opt = projectStatuses.find(s => s.id === project.statusId)
              if (!opt) return null
              return (
                <span className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${pillClass(opt.color)}`}>
                  {opt.color && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(opt.color)}`} />}
                  {opt.label}
                </span>
              )
            })()}
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
                <span key={i} className="bg-white border rounded-full px-2.5 py-0.5 text-xs text-foreground shadow-sm">
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {project.linkedJiras.length > 0 && (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">JIRAs: </span>
              <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
                {project.linkedJiras.map((jira, i) => {
                  const href = safeUrl(jira.url)
                  return href ? (
                    <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
                      {jira.label || jira.url}
                    </a>
                  ) : (
                    <span key={i} className="text-muted-foreground text-xs" title="Invalid URL">
                      {jira.label || jira.url}
                    </span>
                  )
                })}
              </span>
            </div>
          )}
        </div>

        {/* RIGHT: Stats & Metrics */}
        <ProjectStats tasks={tasks} project={project} />

      </div>
    </div>
  )
}
