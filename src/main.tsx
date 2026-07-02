import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply persisted markdown display settings on startup (before first render)
;(function applyMarkdownSettings() {
  const root = document.documentElement

  const spacing = localStorage.getItem('myworker:prose-spacing') ?? 'normal'
  const spacingMap: Record<string, string> = { compact: '0.4em', normal: '1em', relaxed: '1.75em' }
  root.style.setProperty('--prose-p-spacing', spacingMap[spacing] ?? '1em')

  const listSpacing = localStorage.getItem('myworker:prose-list-spacing') ?? 'normal'
  const listMap: Record<string, string> = { compact: '0em', normal: '0.1em', relaxed: '0.4em' }
  root.style.setProperty('--prose-li-spacing', listMap[listSpacing] ?? '0.1em')

  const fontSize = localStorage.getItem('myworker:prose-base-size') ?? 'm'
  const sizeMap: Record<string, string> = { s: '0.8125rem', m: '0.875rem', l: '1rem' }
  root.style.setProperty('--prose-base-size', sizeMap[fontSize] ?? '0.875rem')

  // Code-block wrapping: off by default
  root.classList.toggle('code-wrap', localStorage.getItem('myworker:prose-code-wrap') === 'true')

  // Blockquote quote marks: off by default (class present = marks removed)
  root.classList.toggle('no-bq-quotes', localStorage.getItem('myworker:blockquote-quotes') !== 'true')
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
