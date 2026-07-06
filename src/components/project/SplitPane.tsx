/**
 * SplitPane — resizable two-column layout used in ProjectDetail.
 *
 * The left panel has a percentage width controlled by dragging the divider.
 * The right panel takes the remaining space. Min/max widths prevent either
 * panel from becoming too narrow to use.
 */

import { useRef, useState, type ReactNode } from 'react'
import { SPLIT_MIN_PCT, SPLIT_MAX_PCT, SPLIT_DEFAULT_PCT } from '@/lib/constants'

interface Props {
  left: ReactNode
  right: ReactNode
  initialSplitPct?: number
  /** When set, the divider position is remembered in localStorage under this key. */
  persistKey?: string
}

export function SplitPane({ left, right, initialSplitPct = SPLIT_DEFAULT_PCT, persistKey }: Props) {
  const [splitPct, setSplitPct] = useState(() => {
    if (persistKey) {
      const saved = Number(localStorage.getItem(persistKey))
      if (Number.isFinite(saved) && saved >= SPLIT_MIN_PCT && saved <= SPLIT_MAX_PCT) return saved
    }
    return initialSplitPct
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !containerRef.current) return
    const { left, width } = containerRef.current.getBoundingClientRect()
    const pct = Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, ((e.clientX - left) / width) * 100))
    setSplitPct(pct)
    if (persistKey) localStorage.setItem(persistKey, String(Math.round(pct)))
  }
  const onPointerUp = () => { dragging.current = false }

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div style={{ width: `${splitPct}%` }} className="flex flex-col overflow-hidden min-w-0 min-h-0">
        {left}
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {right}
      </div>
    </div>
  )
}
