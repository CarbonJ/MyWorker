import { useState, useEffect } from 'react'
import { getAllProjectsIncludingArchived } from '@/db/projects'
import { getAllContacts } from '@/db/contacts'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllNotebookPages } from '@/db/notebook'
import { LINKS_CHANGED_EVENT } from '@/db/links'
import { TRASH_CHANGED_EVENT } from '@/db/trash'
import type { WikiEntity, DropdownOption } from '@/types'

export function useWikiEntities(): WikiEntity[] {
  const [entities, setEntities] = useState<WikiEntity[]>([])

  // Editors like the Task Modal stay mounted for the whole session, so reload
  // whenever a linkable entity is added, renamed, archived, deleted or restored.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = () => {
      Promise.all([
        // Archived projects too — a link to a completed project must stay live
        getAllProjectsIncludingArchived(),
        getAllContacts(),
        getDropdownOptions('product_area'),
        getAllNotebookPages(),
      ]).then(([projects, contacts, areas, pages]) => {
        if (cancelled) return
        setEntities([
          ...projects.map(p => ({ type: 'project' as const, id: p.id, name: p.workItem, archived: p.isArchived })),
          ...contacts.map(c => ({ type: 'contact' as const, id: c.id, name: c.name })),
          ...(areas as DropdownOption[]).map(a => ({ type: 'area' as const, id: a.id, name: a.label })),
          ...pages.map(p => ({ type: 'page' as const, id: p.id, name: p.title || 'Untitled' })),
        ])
      }).catch(() => {})
    }
    // Title autosaves can fire in quick succession — reload once they settle
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(load, 300)
    }

    load()
    window.addEventListener(LINKS_CHANGED_EVENT, reload)
    window.addEventListener(TRASH_CHANGED_EVENT, reload)
    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener(LINKS_CHANGED_EVENT, reload)
      window.removeEventListener(TRASH_CHANGED_EVENT, reload)
    }
  }, [])

  return entities
}
