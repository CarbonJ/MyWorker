import { useEffect } from 'react'
import { MemoryRouter, useNavigate, useLocation, UNSAFE_LocationContext } from 'react-router-dom'
import { Maximize2, X, LayoutGrid } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AppRoutes } from '@/components/AppRoutes'
import { usePinnedView } from '@/contexts/PinnedViewContext'

/** Sections the pane can switch to (so "any main view" can be shown/pinned). */
const SECTIONS: { label: string; path: string }[] = [
  { label: 'Projects', path: '/' },
  { label: 'Digest', path: '/digest' },
  { label: 'Notebook', path: '/notebook' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Dashboard', path: '/reporting' },
  { label: 'Weekly report', path: '/weekly' },
  { label: 'Monthly report', path: '/monthly' },
  { label: 'Archive', path: '/archive' },
]

/**
 * The docked reference pane. Renders any app route inside its OWN MemoryRouter so
 * navigation here never touches the main app (and vice-versa). Controls float as an
 * absolute overlay so they don't consume layout height — the page inside still fills
 * the pane exactly (both are 100vh − 57px).
 */
export function PinnedPane() {
  const { pinnedUrl, pinKey, unpin, syncLocation } = usePinnedView()
  const mainNavigate = useNavigate() // outer BrowserRouter — used to "open full"

  if (!pinnedUrl) return null

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* Reset the router context to null so the inner MemoryRouter doesn't trip
          react-router's "cannot render a <Router> inside another <Router>" invariant.
          This gives the pane its own isolated history without touching the main app. */}
      <UNSAFE_LocationContext.Provider value={null as never}>
        <MemoryRouter key={pinKey} initialEntries={[pinnedUrl]}>
          <PaneControls
            onClose={unpin}
            onOpenFull={url => { unpin(); mainNavigate(url) }}
          />
          <PaneLocationReporter onChange={syncLocation} />
          <AppRoutes />
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
    </div>
  )
}

/** Reports the pane's current location up so it can be persisted for reload restore. */
function PaneLocationReporter({ onChange }: { onChange: (url: string) => void }) {
  const location = useLocation()
  useEffect(() => {
    onChange(location.pathname + location.search)
  }, [location, onChange])
  return null
}

function PaneControls({ onClose, onOpenFull }: {
  onClose: () => void
  onOpenFull: (url: string) => void
}) {
  const navigate = useNavigate() // pane's MemoryRouter
  const location = useLocation()
  const currentUrl = location.pathname + location.search

  const iconBtn = 'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-md border bg-background/90 backdrop-blur px-1 py-0.5 shadow-sm">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={iconBtn} title="Show a different view in this pane">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40 p-1">
          {SECTIONS.map(s => (
            <button
              key={s.path}
              type="button"
              onClick={() => navigate(s.path)}
              className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
            >
              {s.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <button type="button" onClick={() => onOpenFull(currentUrl)} className={iconBtn} title="Open this in the main view">
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onClose} className={iconBtn} title="Close pinned pane">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
