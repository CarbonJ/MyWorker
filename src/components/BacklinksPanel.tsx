import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Link2 } from 'lucide-react'
import { ENTITY_ICONS } from '@/lib/icons'
import { getBacklinks } from '@/db/notebook'
import { getMentions } from '@/db/links'
import type { TagRef } from '@/db/tags'
import { recordRoute } from '@/lib/refRoutes'
import { getProjectsByStakeholder } from '@/db/projects'
import type { NotebookBacklink, Project } from '@/types'

interface Props {
  targetType: 'project' | 'contact' | 'page'
  targetId: number
  entityName: string
}

type ActivePanel = 'notes' | 'projects' | 'mentions' | null

const MENTION_LABEL: Record<TagRef['sourceType'], string> = {
  project: 'Project', task: 'Task', worklog: 'Work log', note: 'Note', contact: 'Contact', journal: 'Journal',
}

export function BacklinksPanel({ targetType, targetId, entityName }: Props) {
  const [notes, setNotes] = useState<NotebookBacklink[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  // [[links]] to this entity from work log entries, tasks, journal, projects and other contacts
  const [mentions, setMentions] = useState<TagRef[]>([])
  const [active, setActive] = useState<ActivePanel>(null)
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoaded(false)
    setActive(null)
    Promise.all([
      getBacklinks(targetType, targetId, entityName),
      targetType === 'contact' ? getProjectsByStakeholder(entityName) : Promise.resolve([]),
      getMentions(entityName).catch(() => [] as TagRef[]),
    ]).then(([n, p, m]) => {
      // A page linking to itself isn't a backlink
      setNotes(targetType === 'page' ? n.filter(l => l.pageId !== targetId) : n)
      setProjects(p as Project[])
      // An entity's own record linking to itself isn't a mention worth listing
      setMentions(m.filter(r => !(r.sourceType === targetType && r.id === targetId)))
      setLoaded(true)
    })
  }, [targetType, targetId, entityName])

  if (!loaded || (notes.length === 0 && projects.length === 0 && mentions.length === 0)) return null

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
            <ENTITY_ICONS.note className="h-3 w-3" />
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
            <ENTITY_ICONS.project className="h-3 w-3" />
            Projects ({projects.length})
          </button>
        )}
        {mentions.length > 0 && (
          <button
            type="button"
            onClick={() => toggle('mentions')}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              active === 'mentions' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${active === 'mentions' ? 'rotate-90' : ''}`} />
            <Link2 className="h-3 w-3" />
            Mentions ({mentions.length})
          </button>
        )}
      </div>

      {active === 'mentions' && (
        <div className="mt-2 space-y-1">
          {mentions.map(m => (
            <button
              key={`${m.sourceType}-${m.id}`}
              type="button"
              onClick={() => navigate(recordRoute(m))}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors block"
            >
              <div className="font-medium text-foreground">
                <span className="text-muted-foreground font-normal">{MENTION_LABEL[m.sourceType]} · </span>
                {m.title}
              </div>
              {m.snippet && (
                <div className="text-muted-foreground line-clamp-1 mt-0.5">{m.snippet}</div>
              )}
            </button>
          ))}
        </div>
      )}

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
