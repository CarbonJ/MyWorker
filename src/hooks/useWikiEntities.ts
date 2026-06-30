import { useState, useEffect } from 'react'
import { getAllProjects } from '@/db/projects'
import { getAllContacts } from '@/db/contacts'
import { getDropdownOptions } from '@/db/dropdownOptions'
import { getAllNotebookPages } from '@/db/notebook'
import type { WikiEntity, DropdownOption } from '@/types'

export function useWikiEntities(): WikiEntity[] {
  const [entities, setEntities] = useState<WikiEntity[]>([])

  useEffect(() => {
    Promise.all([
      getAllProjects(),
      getAllContacts(),
      getDropdownOptions('product_area'),
      getAllNotebookPages(),
    ]).then(([projects, contacts, areas, pages]) => {
      setEntities([
        ...projects.map(p => ({ type: 'project' as const, id: p.id, name: p.workItem })),
        ...contacts.map(c => ({ type: 'contact' as const, id: c.id, name: c.name })),
        ...(areas as DropdownOption[]).map(a => ({ type: 'area' as const, id: a.id, name: a.label })),
        ...pages.map(p => ({ type: 'page' as const, id: p.id, name: p.title || 'Untitled' })),
      ])
    }).catch(() => {})
  }, [])

  return entities
}
