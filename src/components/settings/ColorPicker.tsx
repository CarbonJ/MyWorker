// ── Colour picker swatches ────────────────────────────────────────────────────

const COLORS = [
  { value: 'red',    bg: 'bg-red-500',    label: 'Red' },
  { value: 'orange', bg: 'bg-orange-500', label: 'Orange' },
  { value: 'amber',  bg: 'bg-amber-500',  label: 'Amber' },
  { value: 'green',  bg: 'bg-green-500',  label: 'Green' },
  { value: 'blue',   bg: 'bg-blue-500',   label: 'Blue' },
  { value: 'purple', bg: 'bg-purple-500', label: 'Purple' },
  { value: 'grey',   bg: 'bg-slate-400',  label: 'Grey' },
]

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {/* No-colour swatch — transparent with dashed border */}
      <button
        type="button"
        title="No colour"
        onClick={() => onChange('')}
        className={`w-4 h-4 rounded-full border border-dashed border-slate-400 bg-transparent flex items-center justify-center text-slate-400 text-[9px] leading-none ${value === '' ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60 hover:opacity-100'}`}
      >
        ×
      </button>
      {COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`w-4 h-4 rounded-full ${c.bg} ${value === c.value ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60 hover:opacity-100'}`}
        />
      ))}
    </div>
  )
}
