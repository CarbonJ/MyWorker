import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, Plus, Trash2, Search, X, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { exportNote, exportNoteZip, type NoteExportFormat } from '@/lib/noteExport'
import { toast } from 'sonner'
import { MarkdownField } from '@/components/MarkdownField'
import {
  getAllNotebookPages, getNotebookPageById, createNotebookPage,
  updateNotebookPage, deleteNotebookPage, rebuildLinks, rebuildAllLinks,
} from '@/db/notebook'
import { getAllProjects } from '@/db/projects'
import { getAllContacts } from '@/db/contacts'
import { getDropdownOptions } from '@/db/dropdownOptions'
import type { NotebookPage, WikiEntity, DropdownOption } from '@/types'

function relativeTime(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T').replace(/([^Z])$/, '$1Z'))
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotebookPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('page') ? Number(searchParams.get('page')) : null

  const [pages, setPages] = useState<NotebookPage[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [wikiEntities, setWikiEntities] = useState<WikiEntity[]>([])
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [isNew, setIsNew] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPageId = useRef<number | null>(null)

  const loadPages = useCallback(async (): Promise<NotebookPage[]> => {
    const p = await getAllNotebookPages()
    setPages(p)
    return p
  }, [])

  const loadEntities = useCallback(async (freshPages: NotebookPage[]) => {
    const [projects, contacts, areas] = await Promise.all([
      getAllProjects(),
      getAllContacts(),
      getDropdownOptions('product_area'),
    ])
    const entities: WikiEntity[] = [
      ...freshPages.map(p => ({ type: 'page' as const, id: p.id, name: p.title || 'Untitled' })),
      ...projects.map(p => ({ type: 'project' as const, id: p.id, name: p.workItem })),
      ...contacts.map(c => ({ type: 'contact' as const, id: c.id, name: c.name })),
      ...(areas as DropdownOption[]).map(a => ({ type: 'area' as const, id: a.id, name: a.label })),
    ]
    setWikiEntities(entities)
  }, [])

  useEffect(() => {
    // Re-index all links on mount so any notes written before the escaping fix
    // are correctly indexed before BacklinksPanel queries run on project pages.
    rebuildAllLinks().catch(() => {})
    loadPages().then(p => loadEntities(p))
    // ?new=1 from CommandPalette "New Note" action
    if (searchParams.get('new') === '1') {
      handleNewPage()
    } else if (searchParams.get('page') === null) {
      // Default to last viewed page if no page is selected
      const lastId = localStorage.getItem('myworker:notebook-last-page')
      if (lastId) setSearchParams({ page: lastId }, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId === null) {
      if (!isNew) {
        setTitle('')
        setBody('')
      }
      currentPageId.current = null
      return
    }
    localStorage.setItem('myworker:notebook-last-page', String(selectedId))
    getNotebookPageById(selectedId).then(p => {
      if (p) {
        setTitle(p.title)
        setBody(p.body)
        setIsNew(false)
        setSaveStatus('saved')
        currentPageId.current = p.id
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const doSave = useCallback(async (newTitle: string, newBody: string) => {
    setSaveStatus('saving')
    try {
      if (currentPageId.current === null) {
        const id = await createNotebookPage(newTitle || 'Untitled', newBody)
        currentPageId.current = id
        await rebuildLinks(id, newBody)
        const freshPages = await loadPages()
        await loadEntities(freshPages)
        setIsNew(false)
        setSearchParams({ page: String(id) })
      } else {
        await updateNotebookPage(currentPageId.current, newTitle || 'Untitled', newBody)
        await rebuildLinks(currentPageId.current, newBody)
        const freshPages = await loadPages()
        await loadEntities(freshPages)
      }
      setSaveStatus('saved')
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
      setSaveStatus('unsaved')
    }
  }, [loadPages, loadEntities, setSearchParams])

  // Use a ref so the timer always calls the latest doSave (avoids stale closure)
  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave

  // Track the latest unsaved args so we can flush them synchronously on unmount
  const pendingTitleRef = useRef<string | null>(null)
  const pendingBodyRef  = useRef<string | null>(null)

  const scheduleSave = useCallback((newTitle: string, newBody: string) => {
    setSaveStatus('unsaved')
    pendingTitleRef.current = newTitle
    pendingBodyRef.current  = newBody
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      doSaveRef.current(newTitle, newBody)
      pendingTitleRef.current = null
      pendingBodyRef.current  = null
    }, 800)
  }, [])

  // Flush any pending debounced save immediately when the component unmounts
  // (e.g. user presses Escape or navigates away before the 800ms timer fires).
  useEffect(() => {
    return () => {
      if (saveTimer.current && pendingBodyRef.current !== null) {
        clearTimeout(saveTimer.current)
        doSaveRef.current(pendingTitleRef.current ?? '', pendingBodyRef.current)
      }
    }
  }, [])

  const handleNewPage = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setIsNew(true)
    setTitle('')
    setBody('')
    setSaveStatus('unsaved')
    currentPageId.current = null
    setSearchParams({})
  }, [setSearchParams])

  const handleDelete = async (page: NotebookPage, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${page.title || 'Untitled'}"? This cannot be undone.`)) return
    try {
      await deleteNotebookPage(page.id)
      toast.success('Page deleted')
      if (selectedId === page.id || currentPageId.current === page.id) {
        currentPageId.current = null
        setSearchParams({})
        setTitle('')
        setBody('')
        setIsNew(false)
      }
      const freshPages = await loadPages()
      await loadEntities(freshPages)
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const filteredPages = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return pages
    return pages.filter(p =>
      (p.title || 'Untitled').toLowerCase().includes(q) ||
      p.body.toLowerCase().includes(q)
    )
  }, [pages, listSearch])

  const showEditor = isNew || selectedId !== null

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* Left sidebar */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="px-3 py-3 border-b flex items-center gap-2 shrink-0">
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold flex-1">Notebook</span>
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            onClick={handleNewPage} title="New page"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-2 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="Filter…"
              className="h-7 pl-6 pr-6 text-xs"
            />
            {listSearch && (
              <button
                onClick={() => setListSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isNew && !currentPageId.current && (
            <div className="px-3 py-2 bg-accent/40 border-b">
              <div className="text-sm font-medium text-muted-foreground italic truncate">
                {title || 'New page…'}
              </div>
            </div>
          )}
          {filteredPages.map(page => (
            <div
              key={page.id}
              onClick={() => {
                if (saveTimer.current) clearTimeout(saveTimer.current)
                setIsNew(false)
                setSearchParams({ page: String(page.id) })
              }}
              className={`group px-3 py-2 cursor-pointer flex items-start gap-1 hover:bg-accent transition-colors border-b border-border/50 ${selectedId === page.id && !isNew ? 'bg-accent' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{page.title || 'Untitled'}</div>
                <div className="text-xs text-muted-foreground">{relativeTime(page.updatedAt)}</div>
              </div>
              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={e => e.stopPropagation()}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                      title="Export note"
                    >
                      <FileDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="end" onClick={e => e.stopPropagation()}>
                    {(['md', 'pdf'] as NoteExportFormat[]).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
                        onClick={() => exportNote(page, fmt)}
                      >
                        {fmt === 'md' ? 'Markdown (.md)' : 'PDF (print)'}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
                      onClick={() => exportNoteZip(page).catch(err => toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`))}
                    >
                      ZIP (note + images)
                    </button>
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  onClick={(e) => handleDelete(page, e)}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete page"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {filteredPages.length === 0 && !isNew && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {listSearch ? 'No pages match.' : 'No pages yet.'}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showEditor ? (
          <>
            <div className="shrink-0 px-8 pt-6 pb-2 flex items-center gap-3 border-b">
              <Input
                value={title}
                onChange={e => { setTitle(e.target.value); scheduleSave(e.target.value, body) }}
                placeholder="Untitled"
                className="border-0 border-b border-border/50 rounded-none text-xl font-semibold px-0 h-auto pb-1 focus-visible:ring-0 shadow-none flex-1"
              />
              <span className={`text-xs shrink-0 ${
                saveStatus === 'saved' ? 'text-muted-foreground/60' :
                saveStatus === 'saving' ? 'text-amber-500' : 'text-orange-500'
              }`}>
                {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-4">
              <MarkdownField
                id="notebook-body"
                value={body}
                onChange={v => { setBody(v); scheduleSave(title, v) }}
                placeholder="Start writing… type [[ to link to a project, contact, area, or another note."
                rows={16}
                expandable
                enableWikiLinks
                wikiEntities={wikiEntities}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <BookOpen className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a page or create a new one.</p>
            <Button size="sm" onClick={handleNewPage}>
              <Plus className="h-4 w-4 mr-1" />New Page
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
