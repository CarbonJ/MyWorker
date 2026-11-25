import { useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { ImageIcon, Link2, Trash2 } from 'lucide-react'
import { AssetImageDisplay } from '@/components/AssetImageDisplay'
import {
  parseAssetSrc, buildAssetSrc, clampAssetWidth, ASSET_WIDTH_LIMITS,
  type AssetDisplay, type AssetWidthUnit,
} from '@/db/assets'

const PRESETS = [25, 50, 100]

// The image node is draggable, so pressing anywhere inside it and moving would
// start dragging the whole image through the note — including when moving the
// size slider. The browser drags the nearest draggable element, so the controls
// are made draggable themselves and that drag is cancelled.
const noNativeDrag = {
  draggable: true,
  onDragStart: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() },
}

/**
 * Editor node view for a pasted image. Renders the shared display component and,
 * when the node is selected, a toolbar (link/image toggle, size slider, exact
 * size in % or px, presets, delete) plus a corner handle to drag the size.
 *
 * Display state is encoded in the node `src` so it round-trips through markdown
 * serialization. While the slider or handle is being dragged only a local draft
 * width changes; the src is written once on release, so the note isn't re-saved
 * on every pixel and the selection (and toolbar) stays put. Delete removes the
 * node (the file is kept until an unused-image cleanup).
 *
 * In the editor the first click on an image selects it (showing the controls);
 * clicking it again once selected opens the full-size view.
 */
export function AssetImageView({ node, getPos, deleteNode, selected, editor }: NodeViewProps) {
  const src: string = node.attrs.src ?? ''
  const parts = parseAssetSrc(src)
  const editable = editor.isEditable
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  // Width while a drag is in progress; null when showing the saved width
  const [draft, setDraft] = useState<number | null>(null)
  // Text in the size box while it is being typed in
  const [typed, setTyped] = useState<string | null>(null)
  // Whether the image was already selected when the current click began
  const selectedAtDown = useRef(false)

  // Non-asset image (e.g. a pasted external URL) — render plainly, no controls.
  if (!parts) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-top">
        <img src={src} alt={node.attrs.alt ?? ''} className="inline-block max-w-full rounded border border-border" />
      </NodeViewWrapper>
    )
  }

  const { filename, width, unit, display } = parts
  const shownWidth = draft ?? width
  const limits = ASSET_WIDTH_LIMITS[unit]

  // Write the new src and keep the image selected, in one transaction
  const commit = (next: { width?: number; unit?: AssetWidthUnit; display?: AssetDisplay }) => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    const nextUnit = next.unit ?? unit
    const nextSrc = buildAssetSrc(filename, next.width ?? width, next.display ?? display, nextUnit)
    if (nextSrc === src) return
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: nextSrc })
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return true
    }).run()
  }

  // Sizes the image is measured against: its current rendered width and the note's width
  const measure = () => {
    const img = wrapperRef.current?.querySelector('img')
    const note = wrapperRef.current?.closest('.ProseMirror') as HTMLElement | null
    return {
      imgPx: img?.getBoundingClientRect().width ?? 0,
      notePx: note?.clientWidth ?? 0,
      naturalPx: img?.naturalWidth ?? 0,
    }
  }

  const switchUnit = (to: AssetWidthUnit) => {
    if (to === unit) return
    const { imgPx, notePx } = measure()
    if (!imgPx || !notePx) { commit({ unit: to, width: to === '%' ? 100 : 480 }); return }
    commit({ unit: to, width: to === 'px' ? imgPx : (imgPx / notePx) * 100 })
  }

  const commitTyped = () => {
    if (typed === null) return
    const n = Number(typed)
    setTyped(null)
    if (typed.trim() !== '' && Number.isFinite(n)) commit({ width: clampAssetWidth(n, unit) })
  }

  // Drag the corner handle: width follows the pointer, saved on release
  const startHandleDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const { imgPx, notePx } = measure()
    if (!imgPx) return
    const startX = e.clientX
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const toUnit = (px: number) => clampAssetWidth(unit === '%' && notePx ? (px / notePx) * 100 : px, unit)
    let latest = width
    const move = (ev: PointerEvent) => {
      latest = toUnit(imgPx + ev.clientX - startX)
      setDraft(latest)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      setDraft(null)
      commit({ width: latest })
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  const showControls = editable && selected
  const btn = 'rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent'
  const chip = (active: boolean) =>
    `rounded px-1.5 py-0.5 text-[11px] tabular-nums ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`

  return (
    <NodeViewWrapper as="span" ref={wrapperRef} className="relative inline-block align-top max-w-full"
      style={display === 'image' ? { width: `${shownWidth}${unit}` } : undefined}>
      <span className={showControls ? 'ring-2 ring-primary rounded block' : 'block'}
        onMouseDownCapture={() => { selectedAtDown.current = selected }}>
        {/* The wrapper carries the width, so the image just fills it */}
        <AssetImageDisplay filename={filename} width={display === 'image' ? 100 : shownWidth} display={display}
          canZoom={() => !editable || selectedAtDown.current} />
      </span>

      {showControls && display === 'image' && (
        <span
          contentEditable={false}
          data-image-controls
          {...noNativeDrag}
          onPointerDown={startHandleDrag}
          title="Drag to resize"
          className="absolute -right-1.5 -bottom-1.5 z-10 h-3.5 w-3.5 cursor-ew-resize rounded-sm border-2 border-background bg-primary shadow"
        />
      )}

      {showControls && (
        <span
          contentEditable={false}
          // The editor ignores events from here (see stopEvent in assetImage.ts); stopping
          // the default on non-inputs keeps focus, and so the selection, in place.
          data-image-controls
          {...noNativeDrag}
          onMouseDown={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
          className="absolute left-1 top-1 z-10 flex select-none items-center gap-1 whitespace-nowrap rounded-md border border-border bg-popover/95 px-1.5 py-1 shadow-md backdrop-blur"
        >
          <button
            type="button"
            onClick={() => commit({ display: display === 'link' ? 'image' : 'link' })}
            title={display === 'link' ? 'Show as image' : 'Show as link'}
            className={btn}
          >
            {display === 'link' ? <ImageIcon className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          </button>
          {display === 'image' && (
            <>
              <input
                type="range"
                min={unit === '%' ? limits.min : 40}
                max={unit === '%' ? limits.max : Math.max(1600, width)}
                step={1}
                value={shownWidth}
                onChange={e => setDraft(Number(e.target.value))}
                onPointerUp={() => { if (draft !== null) { commit({ width: draft }); setDraft(null) } }}
                onKeyUp={() => { if (draft !== null) { commit({ width: draft }); setDraft(null) } }}
                onBlur={() => { if (draft !== null) { commit({ width: draft }); setDraft(null) } }}
                title={`Width: ${shownWidth}${unit}`}
                className="h-1 w-28 cursor-pointer accent-primary"
              />
              <input
                type="number"
                min={limits.min}
                max={limits.max}
                value={typed ?? String(shownWidth)}
                onChange={e => setTyped(e.target.value)}
                onBlur={commitTyped}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTyped() }
                  if (e.key === 'Escape') { e.stopPropagation(); setTyped(null) }
                }}
                title={`Exact width in ${unit === '%' ? 'percent of the note width' : 'pixels'}`}
                className="h-6 w-14 select-text rounded border border-input bg-background px-1 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="flex items-center rounded border border-input">
                {(['%', 'px'] as const).map(u => (
                  <button key={u} type="button" onClick={() => switchUnit(u)} title={u === '%' ? 'Size as % of the note width' : 'Size in pixels'}
                    className={chip(unit === u)}>
                    {u}
                  </button>
                ))}
              </span>
              <span className="mx-0.5 h-4 w-px bg-border" />
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => commit({ unit: '%', width: p })} title={`${p}% of the note width`}
                  className={chip(unit === '%' && width === p)}>
                  {p}%
                </button>
              ))}
              <button type="button" title="Original size (1:1 pixels)" className={chip(false)}
                onClick={() => { const { naturalPx } = measure(); if (naturalPx) commit({ unit: 'px', width: naturalPx }) }}>
                1:1
              </button>
            </>
          )}
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => deleteNode()}
            title="Remove image from this note (the file is kept until an unused-image cleanup)"
            className={`${btn} hover:text-destructive`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  )
}
