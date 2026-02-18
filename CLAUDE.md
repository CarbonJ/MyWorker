# MyWorker — Claude Context

## Project Overview

**MyWorker** is a Progressive Web App (PWA) for project and task management, built for a Risk Manager's personal workflow.

### Problem it solves
Risk managers need to track projects, log task history, and quickly surface the latest status and notes for in-person reporting. Existing tools like Microsoft SharePoint Lists and JIRA each solve part of the problem — MyWorker aims to combine the best of both.

### Target user
Single user (the project owner). No multi-user or auth requirements.

### Platform
Desktop-first. Mobile support is a nice-to-have.

---

## Deployment & Storage Context

- **Local-only**: Runs entirely in the browser with no server backend.
- **Persistence**: wa-sqlite database file written directly to a user-chosen OneDrive folder via the File System Access API. OneDrive syncs the file across devices and provides free version history.
- **Offline**: Must work fully offline at all times.
- **Portability**: Works across browsers and laptops as long as the database file is accessible.

---

## Tech Stack

| Area | Decision | Notes |
|------|----------|-------|
| JS Framework | React | |
| Design System | shadcn/ui + Tailwind | |
| Bundler | Vite | Use vite-plugin-pwa for PWA support |
| Storage | wa-sqlite + FTS5 | Written to user-chosen folder via File System Access API; FTS5 for partial/multi-word search |
| Hosting | Local file | Served from OneDrive folder, no cloud host |
| Backend | None | Local-only, no server |
| Auth | None | Single user, no login required |

---

## Core Features

### Data Model

**Project**
- Work Item (name), Work Description
- RAG status (Red / Amber / Green)
- Priority (dropdown — user-managed value list)
- Latest status (short text for at-a-glance reporting)
- Product area (dropdown — user-managed value list)
- Stakeholders (free text)
- Linked JIRAs (URLs or IDs)

**Work Log Entry** (always belongs to a Project)
- Timestamped note text (append-only)
- Used for both ongoing effort tracking and status reporting

**Task** (always belongs to a Project)
- Title, description
- Notes
- Status (open / in progress / done)
- Owner (free text)
- Start date (optional)
- Due date (optional)

**Dropdown Option** (user-managed at runtime)
- Type (e.g. "priority" or "product_area")
- Label (display value)
- Sort order

### Screens

1. **Project List**
   - Column/row table layout (one row per project)
   - Columns: Work Item, Product Area, Priority, RAG status, Latest Status, last updated
   - Sort and filter by any column
   - Full-text search bar (searches across projects, tasks, work log)
   - Click row to open Project Detail

2. **Project Detail** — three-pane layout
   - **Top pane:** Project summary (Work Item, Description, RAG, Priority, Product Area, Latest Status, Stakeholders, Linked JIRAs)
   - **Bottom-left pane:** Task list — open/in-progress tasks, with button to add task (opens Task Modal)
   - **Right pane:** Work log — chronological list of timestamped entries, newest first; inline Add Entry button at top
   - Edit project button opens Project Form

3. **Project Form** (same form for create and edit)
   - All project fields: Work Item, Description, RAG status, Priority, Product Area, Latest Status, Stakeholders, Linked JIRAs
   - Dropdowns for Priority and Product Area pull from user-managed option lists

4. **Task Modal** (dialog overlay, create and edit)
   - All task fields: Title, Description, Notes, Status, Owner, Start date, Due date
   - Opened from Project Detail task pane

5. **Quick Work Log Entry**
   - Accessible two ways: inline button in Project Detail right pane, and a global floating quick-add button
   - Global button: select project from dropdown, then type note
   - Submits a timestamped entry to the selected project's work log

6. **Reporting View**
   - Dense table, one row per project
   - Columns: RAG status (colour badge), Work Item, Product Area, Priority, Latest Status
   - Sortable; no editing — read-only
   - Optimised for on-screen use during meetings

7. **Settings**
   - Manage Priority option list (add, edit, delete, reorder)
   - Manage Product Area option list (add, edit, delete, reorder)
   - **Storage:** Display current database file location; button to change folder (re-opens File System Access API picker)
   - **Export:** Download full database as a JSON file (manual backup)
   - **Import:** Upload a previously exported JSON file to restore data (with confirmation warning)

### Search
- Full-text search via FTS5 across projects, tasks, and notes
- Supports partial word and multi-word queries

---

## PWA Specifics

- **Install prompt:** Not required — runs in a browser tab
- **Service worker caching:** Cache-first strategy — all app assets cached on first load, fully offline thereafter
- **Push notifications:** Not used
- **Task due date reminders:** In-app only — overdue and due-today tasks surfaced via badge or banner while the app is open
- **Background sync:** Not required — local-only, no server to sync with
