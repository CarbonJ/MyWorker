import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Home, Replace } from 'lucide-react'
import { getAllNotebookPages, getHomeNotebookPage, getNotebookPageById, setHomeNotebookPage } from '@/db/notebook'
import { WikiLinkContent } from '@/components/WikiLinkContent'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { NotebookPage } from '@/types'

// Pre-v3.20 builds kept the choice in this browser only; it's moved into the database once.
const LEGACY_STORAGE_KEY = 'myworker:digest-home-page'

async function loadHomePage(): Promise<NotebookPage | null> {
  const home = await getHomeNotebookPage()
  const legacyId = Number(localStorage.getItem(LEGACY_STORAGE_KEY))
  if (!legacyId) return home
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  if (home) return home
  const legacy = await getNotebookPageById(legacyId)
  if (legacy) await setHomeNotebookPage(legacy.id)
  return legacy
}

/** Daily Digest "Home" panel: one chosen notebook page, shown read-only every day. */
export function DigestHomeNote() {
  const navigate = useNavigate()
  const [page, setPage] = useState<NotebookPage | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [allPages, setAllPages] = useState<NotebookPage[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let live = true
    loadHomePage()
      .then(p => { if (live) setPage(p) })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])

  const openPicker = (open: boolean) => {
    setPickerOpen(open)
    if (!open) return
    setSearch('')
    getAllNotebookPages().then(setAllPages).catch(() => {})
  }

  const choose = async (p: NotebookPage) => {
    setPickerOpen(false)
    try {
      await setHomeNotebookPage(p.id)
      setPage(p)
    } catch (err) {
      toast.error(`Failed to set Home note: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = allPages
    .filter(p => !q || (p.title || 'Untitled').toLowerCase().includes(q))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || (a.title || '').localeCompare(b.title || ''))

  return (
    <div className="flex flex-col h-full gap-1.5 min-w-0">
      {/* Header row sized to match MarkdownField's label row, so both columns line up */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Label>Home</Label>
          {page && (
            <button
              onClick={() => navigate(`/notebook?page=${page.id}`)}
              className="text-xs leading-none text-muted-foreground hover:text-primary hover:underline truncate"
              title="Open in Notebook"
            >
              · {page.title || 'Untitled'}
            </button>
          )}
        </div>
        <Popover open={pickerOpen} onOpenChange={openPicker}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Choose Home note"
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded shrink-0"
            >
              <Replace size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search notes…" value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>No notes found.</CommandEmpty>
                <CommandGroup>
                  {filtered.map(p => (
                    <CommandItem key={p.id} value={String(p.id)} onSelect={() => choose(p)}>
                      <span className="truncate">{p.title || 'Untitled'}</span>
                      {p.starred && <span className="ml-auto text-amber-500 shrink-0">★</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
        {!loaded ? null : page ? (
          page.body.trim()
            ? <WikiLinkContent>{page.body}</WikiLinkContent>
            : <p className="text-muted-foreground italic">This note is empty.</p>
        ) : (
          <button
            onClick={() => openPicker(true)}
            className="w-full flex flex-col items-center gap-1.5 py-4 text-muted-foreground hover:text-foreground"
          >
            <Home className="h-5 w-5 opacity-40" />
            <span className="text-sm">Choose a note to show here every day</span>
          </button>
        )}
      </div>
    </div>
  )
}
