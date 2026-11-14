import type { TagRef } from '@/db/tags'

/** The screen that shows a referenced record (used by the Tags screen and "mentioned in" lists). */
export function recordRoute(ref: Pick<TagRef, 'sourceType' | 'id' | 'projectId' | 'title'>): string {
  switch (ref.sourceType) {
    case 'project': return `/projects/${ref.id}`
    case 'worklog': return `/projects/${ref.projectId}`
    // A project-less task has no screen of its own — search finds it by title
    case 'task': return ref.projectId ? `/projects/${ref.projectId}` : `/search?q=${encodeURIComponent(ref.title)}`
    case 'note': return `/notebook?page=${ref.id}`
    case 'journal': return `/digest?date=${ref.title}`
    case 'contact': return `/contacts?q=${encodeURIComponent(ref.title)}`
  }
}
