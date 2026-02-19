import { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  getDropdownOptions,
  createDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  reorderDropdownOptions,
} from '@/db/dropdownOptions'
import { exportToJson, importFromJson } from '@/db/importExport'
import { setUserFolderHandle } from '@/db'
import type { DropdownOption, DropdownType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

// ── Colour picker swatches ────────────────────────────────────────────────────

const COLORS = [
  { value: 'red',    bg: 'bg-red-500',    label: 'Red' },
  { value: 'amber',  bg: 'bg-amber-400',  label: 'Amber' },
  { value: 'green',  bg: 'bg-green-500',  label: 'Green' },
  { value: 'blue',   bg: 'bg-blue-500',   label: 'Blue' },
  { value: 'purple', bg: 'bg-purple-500', label: 'Purple' },
  { value: '',       bg: 'bg-slate-300',  label: 'None' },
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
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
    try {
      await createDropdownOption(type, newLabel.trim())
      setNewLabel('')
      load()
    } catch (err) {
      console.error('Failed to add option', err)
      toast.error(`Failed to add option: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSaveEdit = async (id: number, sortOrder: number) => {
    if (!editLabel.trim()) return
    try {
      await updateDropdownOption(id, editLabel.trim(), sortOrder, editColor)
      setEditingId(null)
      load()
    } catch (err) {
      console.error('Failed to update option', err)
      toast.error(`Failed to update option: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleColorChange = async (opt: DropdownOption, color: string) => {
    try {
      await updateDropdownOption(opt.id, opt.label, opt.sortOrder, color)
      load()
    } catch (err) {
      toast.error(`Failed to update color: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this option?')) return
    try {
      await deleteDropdownOption(id)
      load()
    } catch (err) {
      console.error('Failed to delete option', err)
      toast.error(`Failed to delete option: ${err instanceof Error ? err.message : String(err)}`)
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

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleExport = async () => {
    try {
      await exportToJson()
      toast.success('Backup downloaded')
    } catch (err) {
      console.error('Export failed', err)
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
        console.error('Failed to change folder', err)
        toast.error(`Failed to change folder: ${err.message}`)
      }
      // AbortError = user cancelled the picker, nothing to do
    }
  }

  const section = 'space-y-4'
  const sectionTitle = 'text-base font-semibold'

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Dropdown options */}
      <section className={section}>
        <h2 className={sectionTitle}>Dropdown Options</h2>
        <OptionList type="priority" title="Priority" />
        <Separator />
        <OptionList type="product_area" title="Product Area" />
      </section>

      <Separator />

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
    </div>
  )
}
