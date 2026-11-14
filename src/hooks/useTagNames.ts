import { useState, useEffect } from 'react'
import { getKnownTagNames, TAGS_CHANGED_EVENT } from '@/db/tags'

// Collecting tag names scans every text field, and many editors mount at once
// (one per work log entry form, modal field, …), so the list is shared and
// refreshed at most every CACHE_MS — or immediately after a rename/merge/delete.
const CACHE_MS = 30_000
let cache: { at: number; promise: Promise<string[]> } | null = null

function loadTagNames(): Promise<string[]> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), promise: getKnownTagNames().catch(() => []) }
  }
  return cache.promise
}

/** Tag names in use across the app, for #tag autocomplete. */
export function useTagNames(enabled = true): string[] {
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    if (!enabled) return
    let live = true
    const load = () => loadTagNames().then(n => { if (live) setNames(n) })
    const refresh = () => { cache = null; load() }
    load()
    window.addEventListener(TAGS_CHANGED_EVENT, refresh)
    return () => {
      live = false
      window.removeEventListener(TAGS_CHANGED_EVENT, refresh)
    }
  }, [enabled])

  return names
}
