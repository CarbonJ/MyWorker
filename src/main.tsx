import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply persisted prose paragraph spacing on startup
;(function applyProseSpacing() {
  const val = localStorage.getItem('myworker:prose-spacing') ?? 'normal'
  const map: Record<string, string> = { compact: '0.4em', normal: '1em', relaxed: '1.75em' }
  document.documentElement.style.setProperty('--prose-p-spacing', map[val] ?? '1em')
})()

// Auto-reload when a new service worker takes control (seamless update on deploy).
// skipWaiting + clientsClaim are set in vite.config.ts so the new SW activates
// immediately; this listener reloads the page so the new assets are actually used.
if ('serviceWorker' in navigator) {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
