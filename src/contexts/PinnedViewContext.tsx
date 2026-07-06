import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

/**
 * Tracks the app route pinned into the docked reference pane (right side).
 * `pinnedUrl` is a router path like "/notebook?page=3" or "/projects/5", or null
 * when nothing is pinned. Persisted to localStorage so it survives reloads.
 *
 * `pinKey` bumps only on an explicit `pin()` (e.g. the nav-bar button) — the pane's
 * MemoryRouter is keyed by it, so pinning a new view swaps the pane, while the pane's
 * own internal navigation (persisted silently via `syncLocation`) never remounts it.
 */
interface PinnedViewContextValue {
  pinnedUrl: string | null
  pinKey: number
  pin: (url: string) => void
  unpin: () => void
  /** Silently persist the pane's current location (no re-render / no remount). */
  syncLocation: (url: string) => void
}

const STORAGE_KEY = 'myworker:pinned-view'

const PinnedViewContext = createContext<PinnedViewContextValue | null>(null)

export function PinnedViewProvider({ children }: { children: ReactNode }) {
  const [pinnedUrl, setPinnedUrl] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY) || null,
  )
  const [pinKey, setPinKey] = useState(0)

  const pin = useCallback((url: string) => {
    localStorage.setItem(STORAGE_KEY, url)
    setPinnedUrl(url)
    setPinKey(k => k + 1)
  }, [])

  const unpin = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setPinnedUrl(null)
  }, [])

  const syncLocation = useCallback((url: string) => {
    localStorage.setItem(STORAGE_KEY, url)
  }, [])

  return (
    <PinnedViewContext.Provider value={{ pinnedUrl, pinKey, pin, unpin, syncLocation }}>
      {children}
    </PinnedViewContext.Provider>
  )
}

export function usePinnedView(): PinnedViewContextValue {
  const ctx = useContext(PinnedViewContext)
  if (!ctx) throw new Error('usePinnedView must be used within PinnedViewProvider')
  return ctx
}
