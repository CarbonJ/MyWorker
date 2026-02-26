import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { DbProvider } from '@/hooks/useDb'
import { TaskModal } from '@/components/TaskModal'
import { SearchProvider, useSearch } from '@/contexts/SearchContext'
import { Input } from '@/components/ui/input'
import { X, Moon, Sun } from 'lucide-react'
import { getDueSoonTasks } from '@/db/tasks'
import ProjectList from '@/pages/ProjectList'
import ProjectDetail from '@/pages/ProjectDetail'
import ProjectForm from '@/pages/ProjectForm'
import ReportingView from '@/pages/ReportingView'
import TasksView from '@/pages/TasksView'
import ArchiveView from '@/pages/ArchiveView'
import Settings from '@/pages/Settings'

function DueDateBanner() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    getDueSoonTasks().then(tasks => {
      const n = tasks.length
      setCount(n)
      document.title = n > 0 ? `(${n}) MyWorker` : 'MyWorker'
    }).catch(() => {
      // Non-critical — banner simply won't show if this fails
    })
  }, [])

  if (count === 0) return null

  return (
    <a
      href="/tasks?filter=due"
      className="bg-amber-50 border-b border-amber-200 px-6 py-1.5 text-xs text-amber-800 flex items-center gap-2 hover:bg-amber-100 transition-colors cursor-pointer"
    >
      <span>⚠</span>
      <span>{count} task{count !== 1 ? 's' : ''} overdue or due today — click to view</span>
    </a>
  )
}

function NavBar({ isDark, onToggleDark }: { isDark: boolean; onToggleDark: () => void }) {
  const { query, setQuery } = useSearch()
  const location = useLocation()

  // Clear search when navigating to a different route
  useEffect(() => { setQuery('') }, [location.pathname, setQuery])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`

  return (
    <nav className="border-b bg-background px-6 py-3 flex items-center gap-2">
      <img src="/myworker.png" alt="MyWorker" className="w-7 h-7 rounded-md" />
      <span className="font-bold text-lg mr-4">MyWorker</span>
      <NavLink to="/" end className={linkClass}>Projects</NavLink>
      <NavLink to="/tasks" className={linkClass}>Tasks</NavLink>
      <NavLink to="/reporting" className={linkClass}>Reporting</NavLink>
      <NavLink to="/archive" className={linkClass}>Archive</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>
      {/* Global search — top right */}
      <div className="ml-auto relative flex items-center">
        <Input
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-8 w-56 text-sm pr-7"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button onClick={onToggleDark} className="ml-2 text-muted-foreground hover:text-foreground" aria-label="Toggle dark mode">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </nav>
  )
}

function AppInner() {
  const navigate = useNavigate()
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickTaskAreaId, setQuickTaskAreaId] = useState<number | null>(null)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggleDark = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('myworker:theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Cmd+Shift+L / Ctrl+Shift+L → open Quick Add inbox task modal
      // (Cmd+L is reserved by Safari for the address bar)
      if (e.key === 'L' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // Pre-populate area when on the Tasks screen with an area filter active
        if (window.location.pathname.includes('/tasks')) {
          const stored = localStorage.getItem('myworker:tasks-filter-area') ?? ''
          const areaId = stored && stored !== 'all' && stored !== 'inbox' ? Number(stored) : null
          setQuickTaskAreaId(areaId)
        } else {
          setQuickTaskAreaId(null)
        }
        setQuickTaskOpen(true)
        return
      }
      // Esc → navigate home, but only when no modal/dialog is open
      if (e.key === 'Escape') {
        const hasOpenDialog = !!document.querySelector('[role="dialog"]')
        if (!hasOpenDialog) navigate('/')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigate])

  return (
    <SearchProvider>
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar isDark={isDark} onToggleDark={toggleDark} />
      <DueDateBanner />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/projects/new" element={<ProjectForm />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/edit" element={<ProjectForm />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/reporting" element={<ReportingView />} />
          <Route path="/archive" element={<ArchiveView />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <TaskModal
        open={quickTaskOpen}
        projectId={null}
        initialProductAreaId={quickTaskAreaId}
        onClose={() => setQuickTaskOpen(false)}
        onSaved={() => {
          setQuickTaskOpen(false)
          // Notify any mounted page (e.g. TasksView) that it should reload
          window.dispatchEvent(new Event('myworker:task-saved'))
        }}
      />
      <Toaster richColors position="bottom-right" />
    </div>
    </SearchProvider>
  )
}

export default function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </DbProvider>
  )
}
