/**
 * SplitPane — resizable two-column layout used in ProjectDetail.
 *
 * The left panel has a percentage width controlled by dragging the divider.
 * The right panel takes the remaining space. Min/max widths prevent either
 * panel from becoming too narrow to use.
 */

import { useRef, useState, type ReactNode } from 'react'

const SPLIT_MIN_PCT = 20
const SPLIT_MAX_PCT = 80

interface Props {
  left: ReactNode
  right: ReactNode
  initialSplitPct?: number
}

export function SplitPane({ left, right, initialSplitPct = 60 }: Props) {
  const [splitPct, setSplitPct] = useState(initialSplitPct)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !containerRef.current) return
    const { left, width } = containerRef.current.getBoundingClientRect()
    const pct = ((e.clientX - left) / width) * 100
    setSplitPct(Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, pct)))
  }
  const onPointerUp = () => { dragging.current = false }

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div style={{ width: `${splitPct}%` }} className="flex flex-col overflow-hidden min-w-0">
        {left}
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {right}
      </div>
    </div>
  )
}
