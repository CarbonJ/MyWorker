import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Maximize2, Fullscreen, Minimize2 } from 'lucide-react'

type SizeMode = 'default' | 'large' | 'fullscreen'

interface Props {
  id: string
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  initialFocused?: boolean
  expandable?: boolean
}

export function MarkdownField({ id, label, value, onChange, placeholder, rows = 2, onKeyDown, initialFocused = false, expandable = false }: Props) {
  const [focused, setFocused] = useState(initialFocused)
  const [sizeMode, setSizeMode] = useState<SizeMode>('default')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const cycleSize = () => setSizeMode(m => m === 'default' ? 'large' : m === 'large' ? 'fullscreen' : 'default')

  const applyInlineFormat = (el: HTMLTextAreaElement, marker: string) => {
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.substring(start, end)
    const wrapped = `${marker}${selected}${marker}`
    onChange(value.substring(0, start) + wrapped + value.substring(end))
    requestAnimationFrame(() => {
      if (selected.length > 0) {
        el.setSelectionRange(start, start + wrapped.length)
      } else {
        el.setSelectionRange(start + marker.length, start + marker.length)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      onChange(value.substring(0, start) + '  ' + value.substring(end))
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      applyInlineFormat(e.currentTarget, '**')
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault()
      applyInlineFormat(e.currentTarget, '_')
      return
    }
    onKeyDown?.(e)
  }

  const showPreview = !focused && value.trim().length > 0

  const sizeIcon = sizeMode === 'default'
    ? <Maximize2 size={14} />
    : sizeMode === 'large'
      ? <Fullscreen size={14} />
      : <Minimize2 size={14} />

  const sizeTitle = sizeMode === 'default'
    ? 'Expand editor'
    : sizeMode === 'large'
      ? 'Enter fullscreen'
      : 'Collapse editor'

  const expandBtn = expandable && (
    <button
      type="button"
      onClick={cycleSize}
      title={sizeTitle}
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
    >
      {sizeIcon}
    </button>
  )

  const labelRow = (label || expandable) && (
    <div className="flex items-center justify-between">
      {label ? <Label htmlFor={id}>{label}</Label> : <span />}
      {expandBtn}
    </div>
  )

  if (sizeMode === 'fullscreen') {
    return (
      <>
        <div className="space-y-1.5">
          {labelRow}
          <div className="h-10 rounded-md border border-dashed border-input bg-muted/20 px-3 py-2 text-sm text-muted-foreground/60 flex items-center">
            Editing in fullscreen…
          </div>
        </div>
        {createPortal(
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            <div className="flex items-center border-b px-4 py-2 gap-2">
              {label && <span className="text-sm font-medium">{label}</span>}
              <button
                type="button"
                onClick={() => setSizeMode('default')}
                title="Exit fullscreen (Esc)"
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <Minimize2 size={16} />
              </button>
            </div>
            <Textarea
              id={`${id}-fullscreen`}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSizeMode('default'); return }
                handleKeyDown(e)
              }}
              placeholder={placeholder}
              className="flex-1 resize-none rounded-none border-0 focus-visible:ring-0 text-base p-4 break-words h-full"
              autoFocus
            />
            <div className="border-t px-4 py-1.5 text-xs text-muted-foreground/50 flex gap-4">
              <span>Supports Markdown</span>
              <span>Esc · exit fullscreen</span>
            </div>
          </div>,
          document.body
        )}
      </>
    )
  }

  const largeClass = sizeMode === 'large' ? 'h-64 resize-y' : ''

  return (
    <div className="space-y-1.5">
      {labelRow}

      {showPreview ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()) }}
          onFocus={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()) }}
          className={`min-h-[5rem] rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text hover:border-ring/50 transition-colors overflow-y-auto ${largeClass}`}
          title="Click to edit"
        >
          <MarkdownContent>{value}</MarkdownContent>
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={sizeMode === 'large' ? undefined : rows}
          className={`break-words ${largeClass}`}
          autoFocus={focused}
        />
      )}

      {!focused && (
        <p className="text-[11px] text-muted-foreground/60 leading-none">
          {value.trim() ? 'Click to edit · ' : ''}Supports Markdown
        </p>
      )}
    </div>
  )
}
