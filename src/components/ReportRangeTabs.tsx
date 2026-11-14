import { NavLink } from 'react-router-dom'

const RANGES = [
  { to: '/digest', label: 'Daily' },
  { to: '/weekly', label: 'Weekly' },
  { to: '/monthly', label: 'Monthly' },
]

/**
 * Daily / Weekly / Monthly switcher shown in the header of the Digest and the
 * two report views, so all three are reachable from each other in one click.
 */
export function ReportRangeTabs() {
  return (
    <div className="flex items-center rounded-md border overflow-hidden shrink-0">
      {RANGES.map(r => (
        <NavLink
          key={r.to}
          to={r.to}
          className={({ isActive }) =>
            `h-7 px-2.5 text-xs font-medium flex items-center transition-colors border-r last:border-r-0 ${
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
        >
          {r.label}
        </NavLink>
      ))}
    </div>
  )
}
