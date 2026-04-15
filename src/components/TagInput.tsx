/**
 * TagInput — comma-separated tag entry with live pill preview.
 *
 * The user types tags separated by commas. Parent state is updated on every
 * keystroke so form submission always captures the current value, regardless
 * of whether blur has fired. On blur, the display is normalized (deduped,
 * reformatted). The parent-to-raw sync is suppressed while the field is
 * focused to avoid cursor-jumping while typing.
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
  const focusedRef = useRef(false)

  // Sync raw from parent only when not actively editing (e.g. form reset / edit mode load)
  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(value.length > 0 ? value.join(', ') : '')
    }
  }, [value.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRaw = e.target.value
    setRaw(newRaw)
    // Update parent on every keystroke — ensures form submit always reads latest value
    onChange(parseTags(newRaw))
  }

  const handleFocus = () => {
    focusedRef.current = true
  }

  const handleBlur = () => {
    focusedRef.current = false
    // Normalize on blur: deduplicate and reformat display
    const normalized = dedup(parseTags(raw))
    onChange(normalized)
    setRaw(normalized.length > 0 ? normalized.join(', ') : '')
  }

  const preview = parseTags(raw)

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <datalist id={`${id}-suggestions`}>
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
      <Input
        id={id}
        list={`${id}-suggestions`}
        value={raw}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="e.g. infrastructure, Q2 priority, react"
        autoComplete="off"
      />
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
