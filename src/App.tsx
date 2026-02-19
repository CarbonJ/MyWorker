import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { DbProvider } from '@/hooks/useDb'
import { QuickWorkLogButton } from '@/components/QuickWorkLog'
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
    }).catch(err => {
      console.warn('[app] Failed to load due-soon tasks', err)
    })
  }, [])

  if (count === 0) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-1.5 text-xs text-amber-800 flex items-center gap-2">
      <span>⚠</span>
      <span>{count} task{count !== 1 ? 's' : ''} overdue or due today</span>
    </div>
  )
}

function NavBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`

  return (
    <nav className="border-b bg-background px-6 py-3 flex items-center gap-2">
      <span className="font-bold text-lg mr-4">MyWorker</span>
      <NavLink to="/" end className={linkClass}>Projects</NavLink>
      <NavLink to="/tasks" className={linkClass}>Tasks</NavLink>
      <NavLink to="/reporting" className={linkClass}>Reporting</NavLink>
      <NavLink to="/archive" className={linkClass}>Archive</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background flex flex-col">
          <NavBar />
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
        </div>
        <QuickWorkLogButton />
        <Toaster richColors position="bottom-right" />
      </BrowserRouter>
    </DbProvider>
  )
}
