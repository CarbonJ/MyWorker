/**
 * MultiSelectFilter — a Popover-based filter control that allows selecting
 * multiple values from a list. When nothing is selected, the filter is
 * treated as "All". Each option shows a checkbox on the right.
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
  /** Optional leading element (e.g. a color dot) */
  prefix?: React.ReactNode
}

interface Props {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  /** Width class for trigger button, e.g. "w-32" */
  width?: string
}

export function MultiSelectFilter({ options, value, onChange, placeholder, width = 'w-32' }: Props) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find(o => o.value === value[0])?.label ?? value[0])
        : `${value.length} selected`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center justify-between gap-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs font-normal hover:bg-accent hover:text-accent-foreground transition-colors ${width} ${value.length > 0 ? 'border-primary/60 text-primary' : ''}`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {options.map(opt => {
          const checked = value.includes(opt.value)
          return (
            <div
              key={opt.value}
              role="option"
              aria-selected={checked}
              onClick={() => toggle(opt.value)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors cursor-pointer select-none"
            >
              {opt.prefix}
              <span className="flex-1 text-left">{opt.label}</span>
              {/* Visual-only checkbox — avoids nested <button> inside <button> */}
              <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary' : 'border-input'}`}>
                {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </span>
            </div>
          )
        })}
        {value.length > 0 && (
          <>
            <div className="border-t my-1" />
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
            >
              Clear selection
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
