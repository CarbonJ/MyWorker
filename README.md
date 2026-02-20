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

## Installation & Deployment

### For End Users

1. Download the latest release from [GitHub Releases](https://github.com/CarbonJ/MyWorker/releases)
2. Extract `myworker-app.zip` to a folder of your choice
3. Run the appropriate launcher for your platform:
   - **Windows:** Double-click `launch-myworker.bat`
   - **macOS:** Double-click `launch-myworker.command` (or run via Terminal)
   - **Linux:** Run `./launch-myworker.sh` from Terminal

The app will open in your browser at `http://localhost:3000`. On first launch, you'll be prompted to choose a folder for the database file.

For detailed setup and troubleshooting, see [DEPLOY.md](./DEPLOY.md).

### For Developers

To build and develop locally:

```bash
npm install
npm run dev
```

---

## Getting Started (First Launch)

On first launch, MyWorker will prompt you to choose a folder for the database file (`myworker.db`). This folder can be:

- **Any local folder** on your machine
- **A cloud-synced folder** (OneDrive, Google Drive, Dropbox, iCloud, Sync.com, etc.) for automatic backup and cross-device access
- **A network folder** shared with other devices

Once selected, MyWorker creates and manages the database automatically. The database file is portable — you can move it between machines and browsers as long as you select the same folder when prompted.

---

## Browser Compatibility

MyWorker requires a recent version of:
- Google Chrome / Chromium
- Microsoft Edge
- Mozilla Firefox
- Safari

**Required feature:** File System Access API (used to store the database in your chosen folder). Older browsers and Internet Explorer are not supported.

The app works fully offline once running — an internet connection is only required for the initial download.

---

## Architecture Notes

- No server, no backend, no accounts
- All data stored in a single `.sqlite` file on your local filesystem
- Cloud services (OneDrive, Google Drive, etc.) provide optional cross-device access and version history — not required
- PWA service worker caches all assets for full offline use — the app works completely offline once launched
