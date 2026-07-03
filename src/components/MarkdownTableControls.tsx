/**
 * Table controls for the MarkdownField TipTap editor:
 *  - TableInsertPopover — toolbar button with a hover-grid size picker
 *  - TableControlsRow  — second toolbar row (add/delete row/column, delete
 *    table) shown while the caret is inside a table
 *
 * DO NOT add mergeCells / splitCell / toggleHeaderRow buttons, and keep the
 * table extension configured with `resizable: false`. GFM pipe tables cannot
 * represent merged cells, column widths, or headerless tables — and because
 * MarkdownField configures tiptap-markdown with `html: false`, any table the
 * serializer can't express as GFM is written out as the literal string
 * "[table]", silently destroying the user's data on save.
 */

import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Table,
  Trash2,
  Grid2x2X,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function ToolbarBtn({ active, onClick, title, children, disabled = false }: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      // mousedown-preventDefault keeps the editor focused so the BubbleMenu stays open
      onMouseDown={e => { e.preventDefault(); if (!disabled) onClick() }}
      title={title}
      className={`p-1 rounded transition-colors ${
        disabled
          ? 'text-muted-foreground/40 cursor-default'
          : active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      {children}
    </button>
  )
}

const GRID_ROWS = 6
const GRID_COLS = 8

/** Toolbar button that opens a Word-style hover grid to pick the table size. */
export function TableInsertPopover({ editor, disabled = false }: { editor: Editor; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState({ rows: 3, cols: 3 })

  const insert = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setOpen(false)
  }

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          title={disabled ? 'Already in a table' : 'Insert table…'}
          className={`p-1 rounded transition-colors ${
            disabled
              ? 'text-muted-foreground/40 cursor-default'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <Table size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2"
        align="start"
        onOpenAutoFocus={e => e.preventDefault()}
        onMouseDown={e => e.preventDefault()}
      >
        <div className="flex flex-col gap-1.5">
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
            onMouseLeave={() => setHover({ rows: 3, cols: 3 })}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
              const r = Math.floor(i / GRID_COLS) + 1
              const c = (i % GRID_COLS) + 1
              const inRange = r <= hover.rows && c <= hover.cols
              return (
                <button
                  key={i}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setHover({ rows: r, cols: c })}
                  onClick={() => insert(r, c)}
                  title={`${r} × ${c}`}
                  className={`w-[18px] h-[18px] rounded-[3px] border transition-colors ${
                    inRange ? 'bg-primary/30 border-primary' : 'bg-muted border-border'
                  }`}
                />
              )
            })}
          </div>
          <span className="text-xs text-muted-foreground text-center tabular-nums">
            {hover.rows} × {hover.cols}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Second toolbar row shown while the caret is inside a table.
 *
 * `inHeaderRow` disables "add row above" and "delete row": prosemirror-tables
 * would create a plain row above the header (or promote a plain row to first
 * position), producing a headerless table — which the markdown serializer
 * cannot express (see file header).
 */
export function TableControlsRow({ editor, inHeaderRow }: { editor: Editor; inHeaderRow: boolean }) {
  const label = (text: string) => (
    <span className="text-[9px] uppercase tracking-wide text-muted-foreground px-0.5 select-none">{text}</span>
  )
  return (
    <div className="flex items-center gap-0.5 border-t border-border mt-0.5 pt-0.5">
      {label('Row')}
      <ToolbarBtn
        active={false}
        disabled={inHeaderRow}
        onClick={() => editor.chain().focus().addRowBefore().run()}
        title={inHeaderRow ? "Can't add a row above the header" : 'Add row above'}
      ><ArrowUpToLine size={13} /></ToolbarBtn>
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row below"
      ><ArrowDownToLine size={13} /></ToolbarBtn>
      <ToolbarBtn
        active={false}
        disabled={inHeaderRow}
        onClick={() => editor.chain().focus().deleteRow().run()}
        title={inHeaderRow ? "Can't delete the header row" : 'Delete row'}
      ><Trash2 size={13} /></ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      {label('Col')}
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        title="Add column left"
      ><ArrowLeftToLine size={13} /></ToolbarBtn>
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column right"
      ><ArrowRightToLine size={13} /></ToolbarBtn>
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title="Delete column"
      ><Trash2 size={13} /></ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn
        active={false}
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="Delete table"
      ><Grid2x2X size={13} /></ToolbarBtn>
    </div>
  )
}
