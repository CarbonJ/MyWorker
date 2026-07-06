import { Routes, Route } from 'react-router-dom'
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

/**
 * The app's route table. Rendered both by the main content area (under the outer
 * BrowserRouter) and inside the pinned reference pane's own MemoryRouter, so the
 * pinned pane can show — and independently navigate — any view.
 */
export function AppRoutes() {
  return (
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
  )
}
