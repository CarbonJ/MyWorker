import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, FolderOpen, ChevronRight } from 'lucide-react'
import { getBacklinks } from '@/db/notebook'
import { getProjectsByStakeholder } from '@/db/projects'
import type { NotebookBacklink, Project } from '@/types'

interface Props {
  targetType: 'project' | 'contact'
  targetId: number
  entityName: string
}

type ActivePanel = 'notes' | 'projects' | null

export function BacklinksPanel({ targetType, targetId, entityName }: Props) {
  const [notes, setNotes] = useState<NotebookBacklink[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<ActivePanel>(null)
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoaded(false)
    setActive(null)
    Promise.all([
      getBacklinks(targetType, targetId, entityName),
      targetType === 'contact' ? getProjectsByStakeholder(entityName) : Promise.resolve([]),
    ]).then(([n, p]) => {
      setNotes(n)
      setProjects(p as Project[])
      setLoaded(true)
    })
  }, [targetType, targetId, entityName])

  if (!loaded || (notes.length === 0 && projects.length === 0)) return null

  const toggle = (panel: ActivePanel) =>
    setActive(prev => (prev === panel ? null : panel))

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="flex items-center gap-3">
        {notes.length > 0 && (
          <button
            type="button"
            onClick={() => toggle('notes')}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              active === 'notes' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {active === 'notes' ? (
              <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
            ) : (
              <ChevronRight className="h-3 w-3 transition-transform" />
            )}
            <BookOpen className="h-3 w-3" />
            Notebook ({notes.length})
          </button>
        )}
        {targetType === 'contact' && projects.length > 0 && (
          <button
            type="button"
            onClick={() => toggle('projects')}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              active === 'projects' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {active === 'projects' ? (
              <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
            ) : (
              <ChevronRight className="h-3 w-3 transition-transform" />
            )}
            <FolderOpen className="h-3 w-3" />
            Projects ({projects.length})
          </button>
        )}
      </div>

      {active === 'notes' && (
        <div className="mt-2 space-y-1">
          {notes.map(l => (
            <button
              key={l.pageId}
              type="button"
              onClick={() => navigate(`/notebook?page=${l.pageId}`)}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors block"
            >
              <div className="font-medium text-foreground">{l.pageTitle || 'Untitled'}</div>
              {l.snippet && (
                <div className="text-muted-foreground line-clamp-1 mt-0.5">{l.snippet}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {active === 'projects' && (
        <div className="mt-2 space-y-1">
          {projects.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/projects/${p.id}`)}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors block"
            >
              <div className="font-medium text-foreground">{p.workItem}</div>
              {p.latestStatus && (
                <div className="text-muted-foreground line-clamp-1 mt-0.5">{p.latestStatus}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
