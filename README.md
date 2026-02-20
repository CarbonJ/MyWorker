# MyWorker

> 🤖 This project was built entirely with AI assistance using [Claude](https://claude.ai) by Anthropic.

**MyWorker** is a personal project and task management Progressive Web App (PWA) designed for a Risk Manager's day-to-day workflow. It combines the structured tracking of tools like JIRA with the simplicity of a list-based view, running entirely in the browser with no server, no login, and no cloud dependency.

---

## Features

- **Project tracking** — manage projects with RAG status (Red / Amber / Green), priority, product area, stakeholders, and linked JIRAs
- **Work log** — append-only timestamped notes per project for effort tracking and status reporting
- **Task management** — per-project tasks with title, description, status, owner, and due dates
- **Full-text search** — FTS5-powered search across projects, tasks, and work log entries with partial and multi-word support
- **Reporting view** — dense read-only table optimised for on-screen use during meetings
- **Quick log entry** — global floating button to log a note to any project without navigating away
- **Due date reminders** — in-app badges for overdue and due-today tasks
- **User-managed dropdowns** — customise Priority and Product Area option lists at runtime
- **Import / Export** — full JSON backup and restore
- **Offline-first** — works fully offline via service worker caching
- **Local storage** — database written to a user-chosen folder (e.g. OneDrive) via the File System Access API; no data leaves your machine

---

## Tech Stack

| Area | Technology |
|------|------------|
| Framework | React + TypeScript |
| Design System | shadcn/ui + Tailwind CSS |
| Bundler | Vite + vite-plugin-pwa |
| Database | wa-sqlite (SQLite in the browser) with FTS5 |
| Storage | File System Access API |
| Backend | None — fully local |
| Auth | None — single user |

---

## Getting Started

```bash
npm install
npm run dev
```

The app will prompt you to choose a local folder on first launch — this is where the SQLite database file is stored. Placing it in a OneDrive folder gives you automatic sync and version history across devices.

---

## Architecture Notes

- No server, no backend, no accounts
- All data stored in a single `.sqlite` file on your local filesystem
- OneDrive (or any sync folder) provides cross-device access and free version history
- PWA service worker caches all assets for full offline use
