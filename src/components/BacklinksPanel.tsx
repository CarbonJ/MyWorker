import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { getBacklinks } from '@/db/notebook'
import type { NotebookBacklink } from '@/types'

interface Props {
  targetType: 'project' | 'contact'
  targetId: number
  entityName: string
}

export function BacklinksPanel({ targetType, targetId, entityName }: Props) {
  const [links, setLinks] = useState<NotebookBacklink[]>([])
  const [open, setOpen] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoaded(false)
    getBacklinks(targetType, targetId, entityName).then(l => {
      setLinks(l)
      setLoaded(true)
    })
  }, [targetType, targetId, entityName])

  if (!loaded || links.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <BookOpen className="h-3 w-3" />
        Notebook references ({links.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {links.map(l => (
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
    </div>
  )
}
