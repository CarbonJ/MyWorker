/**
 * TagInput — comma-separated tag entry with live pill preview and autocomplete.
 *
 * Suggestions are shown as a dropdown filtered against the partial tag currently
 * being typed (the text after the last comma). Selecting a suggestion completes
 * that tag and appends ", " ready for the next entry.
 */

import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  label?: string
  id?: string
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}

function dedup(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter(t => {
    const key = t.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function TagInput({ value, onChange, suggestions = [], label = 'Tags', id = 'tag-input' }: Props) {
  const [raw, setRaw] = useState(() => value.join(', '))
  const [dropdownItems, setDropdownItems] = useState<string[]>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const focusedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync raw from parent only when not actively editing
  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(value.length > 0 ? value.join(', ') : '')
    }
  }, [value.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // The partial tag currently being typed is the text after the last comma.
  const currentPartial = (raw: string) => {
    const idx = raw.lastIndexOf(',')
    return idx === -1 ? raw : raw.slice(idx + 1)
  }

  const updateDropdown = (rawValue: string) => {
    if (suggestions.length === 0) { setDropdownItems([]); return }
    const partial = currentPartial(rawValue).trim().toLowerCase()
    const existing = new Set(parseTags(rawValue).map(t => t.toLowerCase()))
    const matches = suggestions.filter(s => {
      if (existing.has(s.toLowerCase())) return false
      // No partial typed yet → show all available suggestions
      if (!partial) return true
      return s.toLowerCase().includes(partial)
    }).slice(0, 8)
    setDropdownItems(matches)
    setHighlightedIdx(-1)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRaw = e.target.value
    setRaw(newRaw)
    onChange(parseTags(newRaw))
    updateDropdown(newRaw)
  }

  const selectSuggestion = (suggestion: string) => {
    const lastComma = raw.lastIndexOf(',')
    const prefix = lastComma === -1 ? '' : raw.slice(0, lastComma + 1) + ' '
    const newRaw = prefix + suggestion + ', '
    setRaw(newRaw)
    const newTags = dedup(parseTags(newRaw))
    onChange(newTags)
    setDropdownItems([])
    setHighlightedIdx(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (dropdownItems.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIdx(i => Math.min(i + 1, dropdownItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (highlightedIdx >= 0) {
        e.preventDefault()
        selectSuggestion(dropdownItems[highlightedIdx])
      }
    } else if (e.key === 'Escape') {
      setDropdownItems([])
    }
  }

  const handleFocus = () => {
    focusedRef.current = true
    updateDropdown(raw)
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Delay so click on dropdown items fires before blur hides them
    if (containerRef.current?.contains(e.relatedTarget as Node)) return
    focusedRef.current = false
    setDropdownItems([])
    const normalized = dedup(parseTags(raw))
    onChange(normalized)
    setRaw(normalized.length > 0 ? normalized.join(', ') : '')
  }

  const preview = parseTags(raw)

  return (
    <div ref={containerRef} className="space-y-1.5 relative" onBlur={handleBlur}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input
        id={id}
        value={raw}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="e.g. infrastructure, Q2 priority"
        autoComplete="off"
      />
      {/* Autocomplete dropdown */}
      {dropdownItems.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border border-border rounded-md shadow-md overflow-hidden">
          {dropdownItems.map((item, idx) => (
            <button
              key={item}
              type="button"
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(item) }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                idx === highlightedIdx
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {preview.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {preview.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground/60 leading-none">Separate tags with commas</p>
    </div>
  )
}
