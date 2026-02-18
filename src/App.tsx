import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import ProjectList from '@/pages/ProjectList'
import ProjectDetail from '@/pages/ProjectDetail'
import ReportingView from '@/pages/ReportingView'
import Settings from '@/pages/Settings'

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
      <NavLink to="/reporting" className={linkClass}>Reporting</NavLink>
      <NavLink to="/settings" className={linkClass}>Settings</NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ProjectList />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/reporting" element={<ReportingView />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
