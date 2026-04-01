import { useRef, useState } from 'react'
import { MarkdownContent } from '@/components/MarkdownContent'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  id: string
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  initialFocused?: boolean
}

/**
 * A textarea that renders its content as Markdown when not focused.
 * Click the preview to switch back to editing.
 */
export function MarkdownField({ id, label, value, onChange, placeholder, rows = 2, onKeyDown, initialFocused = false }: Props) {
  const [focused, setFocused] = useState(initialFocused)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    onKeyDown?.(e)
  }

  const showPreview = !focused && value.trim().length > 0

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}

      {showPreview ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()) }}
          onFocus={() => { setFocused(true); requestAnimationFrame(() => textareaRef.current?.focus()) }}
          className="min-h-[5rem] rounded-md border border-input bg-background px-3 py-2 text-sm cursor-text hover:border-ring/50 transition-colors"
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
          rows={rows}
          className="break-words"
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
