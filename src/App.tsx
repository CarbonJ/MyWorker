import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { DbProvider } from '@/hooks/useDb'
import { TaskModal } from '@/components/TaskModal'
import { ProjectModal } from '@/components/ProjectModal'
import { SearchProvider, useSearch } from '@/contexts/SearchContext'
import { Input } from '@/components/ui/input'
import { X, Moon, Sun, Search as SearchIcon, BookOpen } from 'lucide-react'

import { loadGuiSettings, buttonStyle } from '@/lib/guiSettings'
import Prime from '@/pages/Prime'
import ProjectDetail from '@/pages/ProjectDetail'
import ReportingView from '@/pages/ReportingView'
import ArchiveView from '@/pages/ArchiveView'
import Settings from '@/pages/Settings'
import DailyDigestView from '@/pages/DailyDigestView'
import WeeklyReportView from '@/pages/WeeklyReportView'
import MonthlyReportView from '@/pages/MonthlyReportView'
import SearchPage from '@/pages/SearchPage'
import ContactsPage from '@/pages/ContactsPage'
import NotebookPage from '@/pages/NotebookPage'
import { CommandPalette } from '@/components/CommandPalette'


function NavBar({ isDark, onToggleDark }: { isDark: boolean; onToggleDark: () => void }) {
  const { query, setQuery } = useSearch()
  const location = useLocation()
  // Force a re-render whenever button GUI settings change (Settings page dispatches this)
  const [, forceGuiUpdate] = useState(0)

  // Clear search when navigating to a different route
  useEffect(() => { setQuery('') }, [location.pathname, setQuery])

  useEffect(() => {
    const handler = () => forceGuiUpdate(n => n + 1)
    window.addEventListener('myworker:gui-settings-changed', handler)
    return () => window.removeEventListener('myworker:gui-settings-changed', handler)
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`

  const { buttonColor, buttonOpacity } = loadGuiSettings()
  const btnStyle = buttonStyle(buttonColor, buttonOpacity)
  const navStyle = ({ isActive }: { isActive: boolean }) => isActive ? btnStyle : {}

  return (
    <nav className="border-b bg-background px-6 py-3 flex items-center gap-2">
      <img src="/myworker.png" alt="MyWorker" className="w-7 h-7 rounded-md" />
      <span className="font-bold text-lg mr-4">MyWorker</span>
      <NavLink to="/" end className={linkClass} style={navStyle}>Projects</NavLink>
      <NavLink to="/digest" className={linkClass} style={navStyle}>Digest</NavLink>
      <NavLink to="/notebook" className={linkClass} style={navStyle}>
        <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Notebook</span>
      </NavLink>
      <NavLink to="/contacts" className={linkClass} style={navStyle}>Contacts</NavLink>
      <NavLink to="/reporting" className={linkClass} style={navStyle}>Reporting</NavLink>
      <NavLink to="/search" className={linkClass} style={navStyle}>
        <span className="flex items-center gap-1.5"><SearchIcon className="h-3.5 w-3.5" />Search</span>
      </NavLink>
      <NavLink to="/archive" className={linkClass} style={navStyle}>Archive</NavLink>
      <NavLink to="/settings" className={linkClass} style={navStyle}>Settings</NavLink>
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
  const [quickProjectOpen, setQuickProjectOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggleDark = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('myworker:theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K → open Command Palette
      if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        setPaletteOpen(p => !p)
        return
      }
      // Cmd+Shift+T / Ctrl+Shift+T → open Quick Add inbox task modal
      if (e.key === 'T' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setQuickTaskAreaId(null)
        setQuickTaskOpen(true)
        return
      }
      // Esc → navigate home, but not when a dialog is open or a rich-text editor is focused
      if (e.key === 'Escape') {
        const hasOpenDialog = !!document.querySelector('[role="dialog"]')
        const isEditingInEditor = !!document.activeElement?.closest('.ProseMirror')
        if (!hasOpenDialog && !isEditingInEditor) navigate('/')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [navigate])

  return (
    <SearchProvider>
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar isDark={isDark} onToggleDark={toggleDark} />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Prime />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/reporting" element={<ReportingView />} />
          <Route path="/digest" element={<DailyDigestView />} />
          <Route path="/weekly" element={<WeeklyReportView />} />
          <Route path="/monthly" element={<MonthlyReportView />} />
          <Route path="/archive" element={<ArchiveView />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/notebook" element={<NotebookPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewTask={() => { setQuickTaskAreaId(null); setQuickTaskOpen(true) }}
        onNewProject={() => setQuickProjectOpen(true)}
      />
      <ProjectModal
        open={quickProjectOpen}
        onClose={() => setQuickProjectOpen(false)}
        onSaved={(id) => { setQuickProjectOpen(false); if (id > 0) navigate(`/projects/${id}`) }}
      />
      <TaskModal
        open={quickTaskOpen}
        projectId={null}
        initialProductAreaId={quickTaskAreaId}
        onClose={() => setQuickTaskOpen(false)}
        onSaved={() => {
          setQuickTaskOpen(false)
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
