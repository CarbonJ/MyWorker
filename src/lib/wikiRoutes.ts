import type { WikiEntity } from '@/types'

/**
 * Where a [[wiki link]] goes — the single source for the editor, read-only
 * text and anywhere else that opens a linked entity, so the same link always
 * lands in the same place.
 */
export function entityRoute(entity: Pick<WikiEntity, 'type' | 'id' | 'name'>): string {
  switch (entity.type) {
    case 'page': return `/notebook?page=${entity.id}`
    case 'project': return `/projects/${entity.id}`
    // Contacts screen filtered to that person
    case 'contact': return `/contacts?q=${encodeURIComponent(entity.name)}`
    // Projects screen filtered to that area (Prime reads ?area=)
    case 'area': return `/?area=${entity.id}`
  }
}
