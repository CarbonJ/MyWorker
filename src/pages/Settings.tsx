import { useEffect, useState, useRef, useCallback } from 'react'
import { TEXT_COLOR_HEX, buttonStyle, workItemStyle } from '@/lib/guiSettings'
import { toast } from 'sonner'
import {
  getDropdownOptions,
  createDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  reorderDropdownOptions,
  getOptionUsageCount,
} from '@/db/dropdownOptions'
import { exportToJson, importFromJson } from '@/db/importExport'
import { setUserFolderHandle, query } from '@/db'
import { getAllNotebookPages } from '@/db/notebook'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { exportAllNotes, exportAllNotesZip, type NoteExportFormat } from '@/lib/noteExport'
import { MarkdownContent } from '@/components/MarkdownContent'
import type { DropdownOption, DropdownType } from '@/types'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'

// ── Colour picker swatches ────────────────────────────────────────────────────

const COLORS = [
  { value: 'red',    bg: 'bg-red-500',    label: 'Red' },
  { value: 'orange', bg: 'bg-orange-500', label: 'Orange' },
  { value: 'amber',  bg: 'bg-amber-400',  label: 'Amber' },
  { value: 'green',  bg: 'bg-green-500',  label: 'Green' },
  { value: 'blue',   bg: 'bg-blue-500',   label: 'Blue' },
  { value: 'purple', bg: 'bg-purple-500', label: 'Purple' },
  { value: 'grey',   bg: 'bg-slate-400',  label: 'Grey' },
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {/* No-colour swatch — transparent with dashed border */}
      <button
        type="button"
        title="No colour"
        onClick={() => onChange('')}
        className={`w-4 h-4 rounded-full border border-dashed border-slate-400 bg-transparent flex items-center justify-center text-slate-400 text-[9px] leading-none ${value === '' ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60 hover:opacity-100'}`}
      >
        ×
      </button>
      {COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`w-4 h-4 rounded-full ${c.bg} ${value === c.value ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60 hover:opacity-100'}`}
        />
      ))}
    </div>
  )
}

// ── Dropdown Option List Manager ─────────────────────────────────────────────

function OptionList({ type, title }: { type: DropdownType; title: string }) {
  const { handleError } = useErrorHandler()
  const [options, setOptions] = useState<DropdownOption[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')

  const load = useCallback(async () => {
    const opts = await getDropdownOptions(type)
    setOptions(opts)
  }, [type])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newLabel.trim()) return
    if (options.some(o => o.label.toLowerCase() === newLabel.trim().toLowerCase())) {
      toast.warning(`"${newLabel.trim()}" already exists`)
      return
    }
    try {
      await createDropdownOption(type, newLabel.trim())
      setNewLabel('')
      load()
    } catch (err) {
      handleError(err, 'Failed to add option')
    }
  }

  const handleSaveEdit = async (id: number, sortOrder: number) => {
    if (!editLabel.trim()) return
    try {
      await updateDropdownOption(id, editLabel.trim(), sortOrder, editColor)
      setEditingId(null)
      load()
    } catch (err) {
      handleError(err, 'Failed to update option')
    }
  }

  const handleColorChange = async (opt: DropdownOption, color: string) => {
    try {
      await updateDropdownOption(opt.id, opt.label, opt.sortOrder, color)
      load()
    } catch (err) {
      handleError(err, 'Failed to update color')
    }
  }

  const handleDelete = async (opt: DropdownOption) => {
    const usageCount = await getOptionUsageCount(opt.id, type)
    const noun = type === 'priority' ? 'priority' : type === 'product_area' ? 'area' : 'status'
    const msg = usageCount > 0
      ? `"${opt.label}" is used by ${usageCount} project${usageCount !== 1 ? 's' : ''} or task${usageCount !== 1 ? 's' : ''}. Deleting it will clear that ${noun} from those items. Continue?`
      : `Delete "${opt.label}"?`
    if (!confirm(msg)) return
    try {
      await deleteDropdownOption(opt.id)
      load()
    } catch (err) {
      handleError(err, 'Failed to delete option')
    }
  }

  const moveUp = async (index: number) => {
    if (index === 0) return
    const reordered = [...options]
    ;[reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]
    await reorderDropdownOptions(reordered.map(o => o.id))
    load()
  }

  const moveDown = async (index: number) => {
    if (index === options.length - 1) return
    const reordered = [...options]
    ;[reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]]
    await reorderDropdownOptions(reordered.map(o => o.id))
    load()
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">{title}</h3>

      <div className="divide-y divide-border border rounded-md">
        {options.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground text-center">No options yet.</p>
        )}
        {options.map((opt, i) => (
          <div key={opt.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === opt.id ? (
              <>
                <Input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit(opt.id, opt.sortOrder)}
                  className="h-7 text-sm flex-1"
                  autoFocus
                />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleSaveEdit(opt.id, opt.sortOrder)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{opt.label}</span>
                <ColorPicker value={opt.color} onChange={color => handleColorChange(opt, color)} />
                <button onClick={() => moveUp(i)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↑</button>
                <button onClick={() => moveDown(i)} disabled={i === options.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↓</button>
                <button onClick={() => { setEditingId(opt.id); setEditLabel(opt.label); setEditColor(opt.color) }} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
                <button onClick={() => handleDelete(opt)} className="text-xs text-destructive hover:text-destructive/80 px-1">Delete</button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={`New ${title.toLowerCase()} option…`}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={!newLabel.trim()}>Add</Button>
      </div>
    </div>
  )
}


// ── Settings Page ─────────────────────────────────────────────────────────────

interface DataStats {
  projects: number
  tasksActive: number
  tasksDone: number
  workLogEntries: number
  dbSizeMb: string
}

const AREA_BTN_KEY          = 'myworker:area-filter-buttons'
const AREA_BTN_PROJECTS_KEY = 'myworker:area-filter-buttons-projects'

export default function Settings() {
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [dataStats, setDataStats] = useState<DataStats | null>(null)
  const [areaFilterButtons, setAreaFilterButtons] = useState(
    () => localStorage.getItem(AREA_BTN_KEY) === 'true'
  )
  // Area filter buttons on Projects screen — defaults to true (enabled)
  const [areaFilterButtonsProjects, setAreaFilterButtonsProjects] = useState(
    () => localStorage.getItem(AREA_BTN_PROJECTS_KEY) !== 'false'
  )

  const toggleAreaFilterButtons = (checked: boolean) => {
    setAreaFilterButtons(checked)
    localStorage.setItem(AREA_BTN_KEY, String(checked))
  }

  const toggleAreaFilterButtonsProjects = (checked: boolean) => {
    setAreaFilterButtonsProjects(checked)
    localStorage.setItem(AREA_BTN_PROJECTS_KEY, String(checked))
  }

  // GUI color settings
  const [guiButtonColor,   setGuiButtonColor]   = useState(() => localStorage.getItem('myworker:gui-button-color')         ?? '')
  const [guiButtonOpacity, setGuiButtonOpacity] = useState(() => Number(localStorage.getItem('myworker:gui-button-opacity') ?? '20'))

  // Work Item font settings
  const [workItemSize,   setWorkItemSize]   = useState(() => Number(localStorage.getItem('myworker:workitem-size')   ?? '14'))
  const [workItemWeight, setWorkItemWeight] = useState(() => localStorage.getItem('myworker:workitem-weight')        ?? 'medium')
  const [workItemItalic, setWorkItemItalic] = useState(() => localStorage.getItem('myworker:workitem-italic')        === 'true')
  const [workItemColor,  setWorkItemColor]  = useState(() => localStorage.getItem('myworker:workitem-color')         ?? '')

  const [dueFilterShowAll, setDueFilterShowAll] = useState(
    () => localStorage.getItem('myworker:due-filter-show-all') === 'true'
  )

  const [proseSpacing, setProseSpacing] = useState(
    () => localStorage.getItem('myworker:prose-spacing') ?? 'normal'
  )
  const applyProseSpacing = (val: string) => {
    const map: Record<string, string> = { compact: '0.4em', normal: '1em', relaxed: '1.75em' }
    document.documentElement.style.setProperty('--prose-p-spacing', map[val] ?? '1em')
  }
  useEffect(() => {
    applyProseSpacing(proseSpacing)
  }, [proseSpacing])

  const [listSpacing, setListSpacing] = useState(
    () => localStorage.getItem('myworker:prose-list-spacing') ?? 'normal'
  )
  const applyListSpacing = (val: string) => {
    const map: Record<string, string> = { compact: '0em', normal: '0.1em', relaxed: '0.4em' }
    document.documentElement.style.setProperty('--prose-li-spacing', map[val] ?? '0.1em')
  }
  useEffect(() => { applyListSpacing(listSpacing) }, [listSpacing])

  const [baseFontSize, setBaseFontSize] = useState(
    () => localStorage.getItem('myworker:prose-base-size') ?? 'm'
  )
  const applyBaseFontSize = (val: string) => {
    const map: Record<string, string> = { s: '0.8125rem', m: '0.875rem', l: '1rem' }
    document.documentElement.style.setProperty('--prose-base-size', map[val] ?? '0.875rem')
  }
  useEffect(() => { applyBaseFontSize(baseFontSize) }, [baseFontSize])

  const [codeWrap, setCodeWrap] = useState(
    () => localStorage.getItem('myworker:prose-code-wrap') === 'true'
  )
  useEffect(() => {
    document.documentElement.classList.toggle('code-wrap', codeWrap)
  }, [codeWrap])

  // Blockquote quotation marks — off by default (class present = marks removed)
  const [blockquoteQuotes, setBlockquoteQuotes] = useState(
    () => localStorage.getItem('myworker:blockquote-quotes') === 'true'
  )
  useEffect(() => {
    document.documentElement.classList.toggle('no-bq-quotes', !blockquoteQuotes)
  }, [blockquoteQuotes])

  useEffect(() => {
    localStorage.setItem('myworker:gui-button-color', guiButtonColor)
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [guiButtonColor])
  useEffect(() => {
    localStorage.setItem('myworker:gui-button-opacity', String(guiButtonOpacity))
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [guiButtonOpacity])
  useEffect(() => {
    localStorage.setItem('myworker:workitem-size', String(workItemSize))
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [workItemSize])
  useEffect(() => {
    localStorage.setItem('myworker:workitem-weight', workItemWeight)
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [workItemWeight])
  useEffect(() => {
    localStorage.setItem('myworker:workitem-italic', String(workItemItalic))
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [workItemItalic])
  useEffect(() => {
    localStorage.setItem('myworker:workitem-color', workItemColor)
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [workItemColor])

  useEffect(() => {
    Promise.all([
      query('SELECT COUNT(*) as n FROM projects'),
      query("SELECT COUNT(*) as n FROM tasks WHERE status != 'done'"),
      query("SELECT COUNT(*) as n FROM tasks WHERE status = 'done'"),
      query('SELECT COUNT(*) as n FROM work_log_entries'),
      query('PRAGMA page_count'),
      query('PRAGMA page_size'),
    ]).then(([ps, tsActive, tsDone, wl, pageCount, pageSize]) => {
      const bytes = Number((pageCount[0] as Record<string, unknown>).page_count)
                  * Number((pageSize[0]  as Record<string, unknown>).page_size)
      setDataStats({
        projects:       Number((ps[0]       as Record<string, unknown>).n),
        tasksActive:    Number((tsActive[0] as Record<string, unknown>).n),
        tasksDone:      Number((tsDone[0]   as Record<string, unknown>).n),
        workLogEntries: Number((wl[0]       as Record<string, unknown>).n),
        dbSizeMb: (bytes / 1024 / 1024).toFixed(2),
      })
    }).catch(() => { /* non-critical */ })
  }, [])

  const handleExport = async () => {
    try {
      await exportToJson()
      toast.success('Backup downloaded')
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('This will replace ALL existing data. Are you sure?')) {
      e.target.value = ''
      return
    }
    setImporting(true)
    try {
      await importFromJson(file)
      toast.success('Data imported successfully — refresh to see changes')
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleChangeFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      toast.error('Folder sync requires Chrome or Edge. Firefox and Safari are not supported.')
      return
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setUserFolderHandle(handle)
      // Persist to IndexedDB
      const req = indexedDB.open('myworker-meta', 1)
      req.onsuccess = () => {
        const tx = req.result.transaction('handles', 'readwrite')
        tx.objectStore('handles').put(handle, 'folderHandle')
      }
      toast.success('Storage folder updated')
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error(`Failed to change folder: ${err.message}`)
      }
      // AbortError = user cancelled the picker, nothing to do
    }
  }

  const section = 'space-y-4'
  const sectionTitle = 'text-base font-semibold'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">v{__APP_VERSION__}</p>

      <Tabs defaultValue="customization">
        <TabsList>
          <TabsTrigger value="customization">Customization</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          <TabsTrigger value="license">License</TabsTrigger>
        </TabsList>

        {/* ── Customization tab ───────────────────────────────────────── */}
        <TabsContent value="customization">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-8 pt-4">
            <section className={section}>
              <h2 className={sectionTitle}>Dropdown Options</h2>
              <OptionList type="priority" title="Priority Values" />
              <Separator />
              <OptionList type="product_area" title="Areas" />
              <Separator />
              <OptionList type="project_status" title="Status Values" />
            </section>

            <section className={section}>
              <h2 className={sectionTitle}>Filters</h2>
              <div className="flex flex-col gap-3 pl-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="area-filter-buttons-projects"
                    checked={areaFilterButtonsProjects}
                    onCheckedChange={v => toggleAreaFilterButtonsProjects(v === true)}
                  />
                  <label htmlFor="area-filter-buttons-projects" className="text-sm cursor-pointer select-none text-muted-foreground">
                    Show area filter as buttons on the Projects screen
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="area-filter-buttons"
                    checked={areaFilterButtons}
                    onCheckedChange={v => toggleAreaFilterButtons(v === true)}
                  />
                  <label htmlFor="area-filter-buttons" className="text-sm cursor-pointer select-none text-muted-foreground">
                    Show area filter as buttons on the Tasks screen
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="due-filter-show-all"
                    checked={dueFilterShowAll}
                    onCheckedChange={v => {
                      const next = v === true
                      setDueFilterShowAll(next)
                      localStorage.setItem('myworker:due-filter-show-all', String(next))
                      window.dispatchEvent(new Event('myworker:gui-settings-changed'))
                    }}
                  />
                  <label htmlFor="due-filter-show-all" className="text-sm cursor-pointer select-none text-muted-foreground">
                    Show all tasks (not just due/overdue) in Due/Overdue filter mode
                  </label>
                </div>
              </div>
            </section>

            {/* ── GUI column ─────────────────────────────────────── */}
            <section className={section}>
              <h2 className={sectionTitle}>GUI</h2>
              <div className="space-y-5">

                {/* Button Color */}
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Button Color</h3>
                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Color</span>
                      <ColorPicker value={guiButtonColor} onChange={setGuiButtonColor} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={guiButtonOpacity}
                        onChange={e => setGuiButtonOpacity(Number(e.target.value))}
                        className="flex-1 cursor-pointer accent-primary h-1.5"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{guiButtonOpacity}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Preview</span>
                      <div className="flex gap-2 items-center">
                        <span className="h-6 px-3 rounded text-[10px] border bg-primary text-primary-foreground flex items-center leading-none">
                          Default
                        </span>
                        <span
                          className="h-6 px-3 rounded text-[10px] border bg-primary text-primary-foreground flex items-center leading-none"
                          style={buttonStyle(guiButtonColor, guiButtonOpacity)}
                        >
                          Colored
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work Item Style */}
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Work Item Style</h3>
                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Size</span>
                      <input
                        type="range"
                        min="11"
                        max="20"
                        step="1"
                        value={workItemSize}
                        onChange={e => setWorkItemSize(Number(e.target.value))}
                        className="flex-1 cursor-pointer accent-primary h-1.5"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{workItemSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Weight</span>
                      <div className="flex gap-1">
                        {(['normal', 'medium', 'semibold', 'bold'] as const).map(w => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setWorkItemWeight(w)}
                            className={`px-2 py-0.5 rounded text-xs border transition-colors capitalize ${workItemWeight === w ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Style</span>
                      <button
                        type="button"
                        onClick={() => setWorkItemItalic(!workItemItalic)}
                        className={`px-2 py-0.5 rounded text-xs border italic transition-colors ${workItemItalic ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                      >
                        Italic
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Color</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Default (theme color)"
                          onClick={() => setWorkItemColor('')}
                          className={`w-4 h-4 rounded-full border border-dashed border-slate-400 bg-transparent flex items-center justify-center text-slate-400 text-[9px] leading-none ${workItemColor === '' ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60 hover:opacity-100'}`}
                        >
                          ×
                        </button>
                        {Object.entries(TEXT_COLOR_HEX).map(([name, hex]) => (
                          <button
                            key={name}
                            type="button"
                            title={name.charAt(0).toUpperCase() + name.slice(1)}
                            onClick={() => setWorkItemColor(name)}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${workItemColor === name ? 'ring-2 ring-offset-1 ring-foreground scale-110' : 'opacity-70 hover:opacity-100 border-transparent'}`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Preview</span>
                      <span
                        className="truncate"
                        style={workItemStyle({ workItemSize, workItemWeight, workItemItalic, workItemColor })}
                      >
                        My Work Item Title
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </section>
          </div>

          {/* ── Keyboard Shortcuts ─────────────────────────────────────── */}
          <Separator className="mt-6" />
          <section className="space-y-4 pt-4">
            <h2 className={sectionTitle}>Keyboard Shortcuts</h2>

            {/* Command Palette */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-sm">Command Palette</h3>
                <div className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">⌘</kbd>
                  <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">K</kbd>
                  <span className="text-xs text-muted-foreground ml-1">/ Ctrl+K</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Opens a searchable pop-up giving fast access to every screen and action without using the nav bar.
                Type any word to filter — results update instantly.
              </p>
              <div className="border rounded-md divide-y divide-border text-sm overflow-hidden">
                {/* Navigate */}
                <div className="px-3 py-2 bg-muted/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigate</span>
                </div>
                {[
                  { label: 'Prime',          desc: 'Project list — your main working view' },
                  { label: 'Daily Digest',   desc: 'A focused daily summary of your active projects and open tasks' },
                  { label: 'Weekly Report',  desc: 'Work log entries grouped by project for the current week, ready to copy' },
                  { label: 'Monthly Report', desc: 'Same as Weekly Report but spanning a full calendar month' },
                  { label: 'Reporting',      desc: 'Dense read-only table for on-screen use during meetings' },
                  { label: 'Archive',        desc: 'Closed / completed projects' },
                  { label: 'Contacts',       desc: 'People and stakeholder directory' },
                  { label: 'Notebook',       desc: 'Personal notes and knowledge base with wiki-links' },
                  { label: 'Settings',       desc: 'This page' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 font-medium text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}

                {/* Actions */}
                <div className="px-3 py-2 bg-muted/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</span>
                </div>
                {[
                  { label: 'New Project', desc: 'Opens the project creation form' },
                  { label: 'New Task',    desc: 'Opens the quick task creation modal' },
                  { label: 'New Note',    desc: 'Opens the Notebook with a blank new page ready to write' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="w-28 shrink-0 font-medium text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}

                {/* Projects */}
                <div className="px-3 py-2 bg-muted/40">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
                </div>
                <div className="px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    All your projects are listed and searchable by name. Selecting one jumps directly to its detail page.
                  </span>
                </div>
              </div>
            </div>

            {/* Other shortcuts */}
            <div className="space-y-2">
              <h3 className="font-medium text-sm">Other Shortcuts</h3>
              <div className="border rounded-md divide-y divide-border overflow-hidden">
                {[
                  {
                    keys: ['⌘', 'Shift', 'T'],
                    alt:  'Ctrl+Shift+T',
                    desc: 'Open quick task creation modal (global)',
                  },
                  {
                    keys: ['Esc'],
                    alt:  null,
                    desc: 'Return to main screen when no modal is open',
                  },
                ].map(({ keys, alt, desc }) => (
                  <div key={desc} className="flex items-center gap-4 px-3 py-2">
                    <div className="flex items-center gap-1 shrink-0 w-44">
                      {keys.map(k => (
                        <kbd key={k} className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">{k}</kbd>
                      ))}
                      {alt && <span className="text-xs text-muted-foreground ml-1">/ {alt}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ── Data tab ────────────────────────────────────────────────── */}
        <TabsContent value="data" className="space-y-8">

          {/* Storage */}
          <section className={section}>
            <h2 className={sectionTitle}>Storage</h2>
            {'showDirectoryPicker' in window ? (
              <>
                <p className="text-sm text-muted-foreground">
                  MyWorker saves your database to your chosen folder (e.g. OneDrive) automatically on every change.
                </p>
                <Button variant="outline" onClick={handleChangeFolder}>
                  Change storage folder…
                </Button>
              </>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                <p className="font-medium">Folder sync not available in this browser</p>
                <p>
                  Your data is safely stored in browser storage (IndexedDB).
                  To enable automatic OneDrive sync, open MyWorker in <strong>Chrome</strong> or <strong>Edge</strong>.
                </p>
                <p className="text-xs opacity-75">
                  Firefox and Safari do not support the File System Access API required for folder sync.
                  Use <strong>Export backup (JSON)</strong> below to manually back up your data in any browser.
                </p>
              </div>
            )}
          </section>

          <Separator />

          {/* Data Usage */}
          <section className={section}>
            <h2 className={sectionTitle}>Data Usage</h2>
            {dataStats ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Projects',       value: dataStats.projects },
                  { label: 'Work Log Notes', value: dataStats.workLogEntries },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border px-4 py-3 text-center">
                    <p className="text-2xl font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
                <div className="rounded-md border px-4 py-3 text-center">
                  <p className="text-2xl font-semibold tabular-nums">
                    {dataStats.tasksActive}
                    <span className="text-base font-normal text-muted-foreground mx-1">|</span>
                    {dataStats.tasksDone}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tasks Open | Done</p>
                </div>
                <div className="rounded-md border px-4 py-3 text-center">
                  <p className="text-2xl font-semibold tabular-nums">{dataStats.dbSizeMb}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">DB Size (MB)</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </section>

          <Separator />

          {/* Notebook Export */}
          <section className={section}>
            <h2 className={sectionTitle}>Notebook Export</h2>
            <div className="flex gap-3 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Export all notes…</Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="start">
                  {(['md', 'pdf'] as NoteExportFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
                      onClick={async () => {
                        try {
                          const pages = await getAllNotebookPages()
                          if (pages.length === 0) { toast.info('No notebook pages to export'); return }
                          exportAllNotes(pages.map(p => ({ title: p.title, body: p.body })), fmt)
                          if (fmt !== 'pdf') toast.success(`Exported ${pages.length} note${pages.length !== 1 ? 's' : ''}`)
                        } catch (err) {
                          toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
                        }
                      }}
                    >
                      {fmt === 'md' ? 'Markdown (single .md)' : 'PDF (print)'}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1 text-sm rounded hover:bg-accent transition-colors"
                    onClick={async () => {
                      try {
                        const pages = await getAllNotebookPages()
                        if (pages.length === 0) { toast.info('No notebook pages to export'); return }
                        exportAllNotesZip(pages.map(p => ({ title: p.title, body: p.body })))
                        toast.success(`Exported ${pages.length} note${pages.length !== 1 ? 's' : ''} to ZIP`)
                      } catch (err) {
                        toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
                      }
                    }}
                  >
                    ZIP (one .md per note)
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">Markdown/PDF combine all pages into one file; ZIP contains a separate .md file per note. PDF opens a print dialog.</p>
          </section>

          {/* Import / Export */}
          <section className={section}>
            <h2 className={sectionTitle}>Backup &amp; Restore</h2>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleExport}>
                Export backup (JSON)
              </Button>
              <Button
                variant="outline"
                onClick={() => importRef.current?.click()}
                disabled={importing}
              >
                {importing ? 'Importing…' : 'Import backup (JSON)'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Import will replace all existing data. Make sure to export a backup first.
            </p>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </section>

        </TabsContent>

        {/* ── License tab ─────────────────────────────────────────────── */}
        <TabsContent value="markdown" className="pt-4 max-w-2xl space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3">Display</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Control how markdown is rendered across all fields. Changes apply live — the previews below update as you adjust each setting.
            </p>

            <div className="space-y-5">
              {/* Paragraph spacing */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Paragraph spacing</label>
                <div className="flex gap-1">
                  {(['compact', 'normal', 'relaxed'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setProseSpacing(v); localStorage.setItem('myworker:prose-spacing', v) }}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors capitalize ${proseSpacing === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Vertical gap between paragraphs.</p>
                <div className="border rounded-md p-3 bg-muted/20">
                  <MarkdownContent>{'First paragraph of the preview.\n\nSecond paragraph — spacing above reflects your choice.'}</MarkdownContent>
                </div>
              </div>

              {/* List spacing */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">List spacing</label>
                <div className="flex gap-1">
                  {(['compact', 'normal', 'relaxed'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setListSpacing(v); localStorage.setItem('myworker:prose-list-spacing', v) }}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors capitalize ${listSpacing === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Vertical gap between list items.</p>
                <div className="border rounded-md p-3 bg-muted/20">
                  <MarkdownContent>{'- First item\n- Second item\n- Third item'}</MarkdownContent>
                </div>
              </div>

              {/* Base font size */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Base font size</label>
                <div className="flex gap-1">
                  {([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']] as const).map(([v, lbl]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setBaseFontSize(v); localStorage.setItem('myworker:prose-base-size', v) }}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${baseFontSize === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Base text size of markdown fields.</p>
                <div className="border rounded-md p-3 bg-muted/20">
                  <MarkdownContent>{'The quick brown fox jumps over the lazy dog.'}</MarkdownContent>
                </div>
              </div>

              {/* Code block line wrapping */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="prose-code-wrap"
                    checked={codeWrap}
                    onCheckedChange={v => { const next = v === true; setCodeWrap(next); localStorage.setItem('myworker:prose-code-wrap', String(next)) }}
                  />
                  <label htmlFor="prose-code-wrap" className="text-sm font-medium cursor-pointer select-none">Wrap long lines in code blocks</label>
                </div>
                <p className="text-xs text-muted-foreground">When off, long lines scroll horizontally instead of wrapping.</p>
                <div className="border rounded-md p-3 bg-muted/20">
                  <MarkdownContent>{'```\nconst reallyLongVariableName = someFunction(withAnArgument, andAnother, andYetAnotherOne)\n```'}</MarkdownContent>
                </div>
              </div>

              {/* Blockquote quote marks */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="blockquote-quotes"
                    checked={blockquoteQuotes}
                    onCheckedChange={v => { const next = v === true; setBlockquoteQuotes(next); localStorage.setItem('myworker:blockquote-quotes', String(next)) }}
                  />
                  <label htmlFor="blockquote-quotes" className="text-sm font-medium cursor-pointer select-none">Show blockquote quotation marks</label>
                </div>
                <p className="text-xs text-muted-foreground">When off, blockquotes show only the left border bar (no “ ” marks).</p>
                <div className="border rounded-md p-3 bg-muted/20">
                  <MarkdownContent>{'> A quoted line of text.'}</MarkdownContent>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Markdown Reference</h3>
            <p className="text-xs text-muted-foreground mb-4">
              All text fields in MyWorker use a rich markdown editor. You can type markdown syntax directly or use the floating toolbar that appears when text is selected.
            </p>

            {([
              {
                heading: 'Text Formatting',
                rows: [
                  ['`**text**`', 'Bold'],
                  ['`*text*`', 'Italic'],
                  ['`~~text~~`', 'Strikethrough'],
                  ['`==text==`', 'Highlight (amber background)'],
                  ['`` `text` ``', 'Inline code'],
                ],
              },
              {
                heading: 'Headings',
                rows: [
                  ['`# Heading`', 'Heading 1'],
                  ['`## Heading`', 'Heading 2'],
                  ['`### Heading`', 'Heading 3'],
                ],
              },
              {
                heading: 'Lists',
                rows: [
                  ['`- item`', 'Bullet list (also `*` or `+`)'],
                  ['`1. item`', 'Numbered list'],
                  ['`- [ ] task`', 'Task list item (unchecked)'],
                  ['`- [x] task`', 'Task list item (checked)'],
                ],
              },
              {
                heading: 'Blocks',
                rows: [
                  ['`> text`', 'Blockquote'],
                  ['` ``` `', 'Code block'],
                  ['`---`', 'Horizontal rule'],
                ],
              },
              {
                heading: 'Links & Tables',
                rows: [
                  ['`[label](url)`', 'Hyperlink'],
                  ['`[[Name]]`', 'Wiki link — links to a note, project, contact, or area; shows blue if the target exists'],
                  ['`| A | B |`', 'Table — use the toolbar button to insert a 3×3 table'],
                ],
              },
              {
                heading: 'Auto Typography',
                rows: [
                  ['--', 'En dash (–)'],
                  ['---', 'Em dash (—)'],
                  ['...', 'Ellipsis (…)'],
                  ['"quoted"', 'Curly double quotes (" ")'],
                  ["'quoted'", "Curly single quotes (' ')"],
                  ["1/2  1/4  3/4", 'Fractions (½ ¼ ¾)'],
                  ['(c)  (r)  (tm)', 'Symbols (© ® ™)'],
                ],
              },
              {
                heading: 'Not Supported',
                rows: [
                  ['`^superscript^`', 'Superscript'],
                  ['`~subscript~`', 'Subscript'],
                ],
              },
            ] as { heading: string; rows: [string, string][] }[]).map(section => (
              <div key={section.heading} className="mb-5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{section.heading}</h4>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {section.rows.map(([syntax, desc]) => (
                      <tr key={syntax} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-6 font-mono text-xs whitespace-nowrap text-foreground/80 w-44">{syntax.replace(/^`|`$/g, '').trim()}</td>
                        <td className="py-1.5 text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <p className="text-xs text-muted-foreground border-t pt-4">
              Tip: select any text in the editor to reveal the floating toolbar for bold, italic, highlight, headings, code, and tables.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="license" className="space-y-4 pt-4 max-w-2xl">
          <h2 className={sectionTitle}>License</h2>
          <p className="text-sm text-muted-foreground">
            MyWorker is released into the public domain under the <strong>Unlicense</strong> — the most permissive open-source license available.
            You are free to use, copy, modify, publish, sell, or distribute this software for any purpose, with no restrictions.
          </p>
          <pre className="text-xs text-muted-foreground bg-muted rounded-md p-4 whitespace-pre-wrap font-mono leading-relaxed">
{`This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the software
to the public domain. We make this dedication for the benefit of the
public at large and to the detriment of our heirs and successors.
We intend this dedication to be an overt act of relinquishment in
perpetuity of all present and future rights to this software under
copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>`}
          </pre>
        </TabsContent>

      </Tabs>
    </div>
  )
}
