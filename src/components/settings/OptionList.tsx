// ── Dropdown Option List Manager ─────────────────────────────────────────────
// Manages one user-editable option list (priorities, areas, statuses):
// add, rename, recolour, reorder and delete, with usage-count warnings. For
// statuses, also which one means "done" (what Mark Complete sets).
// Extracted from Settings.tsx.

import { useState } from 'react'
import { toast } from 'sonner'
import {
  getDropdownOptions,
  createDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  reorderDropdownOptions,
  getOptionUsageCount,
  setDoneStatus,
} from '@/db/dropdownOptions'
import type { DropdownOption, DropdownType } from '@/types'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useDataLoader } from '@/hooks/useDataLoader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ColorPicker } from './ColorPicker'

export function OptionList({ type, title }: { type: DropdownType; title: string }) {
  const { handleError } = useErrorHandler()
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')

  // type is fixed for the lifetime of each OptionList instance
  const { data, reload: load } = useDataLoader(() => getDropdownOptions(type), 'Failed to load options')
  const options = data ?? []

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

  const handleSetDone = async (opt: DropdownOption) => {
    try {
      await setDoneStatus(opt.id)
      toast.success(`Mark Complete now sets the status to "${opt.label}"`)
      load()
    } catch (err) {
      handleError(err, 'Failed to set the done status')
    }
  }

  const handleDelete = async (opt: DropdownOption) => {
    const usageCount = await getOptionUsageCount(opt.id, type)
    const noun = type === 'priority' ? 'priority' : type === 'product_area' ? 'area' : 'status'
    const doneNote = opt.isDone ? '\n\nIt is the done status: until you choose another, Mark Complete will leave a project\'s status unchanged.' : ''
    const msg = (usageCount > 0
      ? `"${opt.label}" is used by ${usageCount} project${usageCount !== 1 ? 's' : ''} or task${usageCount !== 1 ? 's' : ''}. Deleting it will clear that ${noun} from those items. Continue?`
      : `Delete "${opt.label}"?`) + doneNote
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
      {type === 'project_status' && (
        <p className="text-xs text-muted-foreground">
          The <span className="font-medium">Done</span> marker shows the status Mark Complete gives a project. Renaming it is fine.
          {options.length > 0 && !options.some(o => o.isDone) && (
            <span className="text-amber-700 dark:text-amber-400"> None is chosen — click “Set as done” on one.</span>
          )}
        </p>
      )}

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
                {type === 'project_status' && (opt.isDone ? (
                  <span className="text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                    title="Mark Complete sets this status">
                    ✓ Done
                  </span>
                ) : (
                  <button onClick={() => handleSetDone(opt)} title="Make this the status Mark Complete sets"
                    className="text-xs text-muted-foreground hover:text-foreground px-1">
                    Set as done
                  </button>
                ))}
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
