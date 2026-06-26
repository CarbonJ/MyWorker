import { useEffect, useState, useRef, useCallback } from 'react'
import { ROW_COLOR_RGB, TEXT_COLOR_HEX, buttonStyle, workItemStyle } from '@/lib/guiSettings'
import { toast } from 'sonner'
import {
  getDropdownOptions,
  createDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  reorderDropdownOptions,
} from '@/db/dropdownOptions'
import { exportToJson, importFromJson } from '@/db/importExport'
import { getAllStakeholderNames, renameStakeholder, deleteStakeholder } from '@/db/projects'
import { setUserFolderHandle, query } from '@/db'
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

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this option?')) return
    try {
      await deleteDropdownOption(id)
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
                <button onClick={() => handleDelete(opt.id)} className="text-xs text-destructive hover:text-destructive/80 px-1">Delete</button>
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

// ── Stakeholder Manager ───────────────────────────────────────────────────────

function StakeholderManager() {
  const { handleError } = useErrorHandler()
  const [names, setNames] = useState<string[]>([])
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const load = useCallback(async () => {
    const n = await getAllStakeholderNames()
    setNames(n)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRename = async (oldName: string) => {
    const newName = editValue.trim()
    if (!newName) return
    if (newName !== oldName && names.includes(newName)) {
      toast.warning(`"${newName}" already exists`)
      return
    }
    try {
      await renameStakeholder(oldName, newName)
      setEditingName(null)
      load()
    } catch (err) {
      handleError(err, 'Failed to rename stakeholder')
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Remove "${name}" from all projects?`)) return
    try {
      await deleteStakeholder(name)
      load()
    } catch (err) {
      handleError(err, 'Failed to delete stakeholder')
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Stakeholders</h3>
      <div className="divide-y divide-border border rounded-md">
        {names.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground text-center">No stakeholders yet.</p>
        )}
        {names.map(name => (
          <div key={name} className="flex items-center gap-2 px-3 py-2">
            {editingName === name ? (
              <>
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename(name)}
                  className="h-7 text-sm flex-1"
                  autoFocus
                />
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleRename(name)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingName(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{name}</span>
                <button onClick={() => { setEditingName(name); setEditValue(name) }} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
                <button onClick={() => handleDelete(name)} className="text-xs text-destructive hover:text-destructive/80 px-1">Delete</button>
              </>
            )}
          </div>
        ))}
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
  const [guiRowColor,      setGuiRowColor]      = useState(() => localStorage.getItem('myworker:gui-row-color')            ?? '')
  const [guiRowOpacity,    setGuiRowOpacity]    = useState(() => Number(localStorage.getItem('myworker:gui-row-opacity')   ?? '20'))
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

  useEffect(() => {
    localStorage.setItem('myworker:gui-row-color', guiRowColor)
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [guiRowColor])
  useEffect(() => {
    localStorage.setItem('myworker:gui-row-opacity', String(guiRowOpacity))
    window.dispatchEvent(new Event('myworker:gui-settings-changed'))
  }, [guiRowOpacity])
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
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
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

                {/* Row Color */}
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Row Color</h3>
                  <div className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Color</span>
                      <ColorPicker value={guiRowColor} onChange={setGuiRowColor} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={guiRowOpacity}
                        onChange={e => setGuiRowOpacity(Number(e.target.value))}
                        className="flex-1 cursor-pointer accent-primary h-1.5"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{guiRowOpacity}%</span>
                    </div>
                    {guiRowColor && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">Preview</span>
                        <div className="flex gap-1">
                          <div className="h-5 w-16 rounded border" />
                          <div
                            className="h-5 w-16 rounded border"
                            style={{ backgroundColor: `rgba(${ROW_COLOR_RGB[guiRowColor] ?? ''}, ${guiRowOpacity / 100})` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

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
                  { label: 'Weekly Report',  desc: 'Auto-generated status report for the current week, ready to copy' },
                  { label: 'Reporting',      desc: 'Dense read-only table for on-screen use during meetings' },
                  { label: 'Archive',        desc: 'Closed / completed projects' },
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
                    keys: ['⌘', 'Shift', 'L'],
                    alt:  'Ctrl+Shift+L',
                    desc: 'Open quick work log entry modal (global)',
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

        {/* ── Maintenance tab ─────────────────────────────────────────── */}
        <TabsContent value="maintenance" className="space-y-8 pt-4">
          <section className={section}>
            <h2 className={sectionTitle}>Stakeholder Management</h2>
            <p className="text-sm text-muted-foreground">Rename or remove stakeholders across all projects.</p>
            <StakeholderManager />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
