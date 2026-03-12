# Release Notes

## 2.1.2 — 2026-03-12

### Defects Fixed

- **Safari select lockup in Task Modal** — Status and Priority dropdowns in the New/Edit Task modal were non-functional in Safari (modal locked after opening the dropdown). Fixed by using `position="popper"` on all `SelectContent` components inside the dialog, avoiding the item-aligned portal conflict in Safari's Radix UI handling.
- **Due date popover not closing after selection** — Clicking a due date in expanded project task rows (and general task rows) left the calendar popover open after selecting a date or clicking Clear. Fixed by converting both popovers to controlled open state so they explicitly close on selection.
- **Work log entry causing horizontal scroll** — The latest work log text in each project row was spanning all columns (`colSpan={5}`), causing a horizontal scrollbar when entries were long. Fixed by scoping the cell to the Work Item column only, with `overflow-hidden`, so it truncates at the RAG column.

### Improvements

- **Upcoming filter now applies to project tasks** — The "Upcoming" toggle previously only filtered the General Tasks pane. It now also filters the expanded task rows within each project to show only tasks due within the next 7 days.
- **Search includes tasks** — The global search bar now searches task titles, descriptions, and notes in addition to project names and status comments. Projects with matching tasks appear in the project list; their task rows are filtered to show only matches and auto-expanded.

---

## 2.1.1 — 2026-03-11

### Defects Fixed

- **Due date colours in Safari** — Overdue (red) and due-today (amber) highlights on task due dates were not rendering correctly in Safari due to a mixed UTC/local-time Date comparison. Fixed by using pure ISO string comparison, consistent with how the due-today check already worked.

---

## 2.1.0 — 2026-03-11

### New Features

- **Inbox filter** — Added "Inbox" option (italic) to the General Tasks status filter. Shows only tasks with no area assigned (truly ungrouped tasks).

- **Upcoming toggle** — Added "Upcoming" toggle button next to the General Tasks status filter. When active, displays tasks due within the next 7 days.

- **Inline project field editing** — RAG, Priority, and Status can now be changed directly from the Prime view (project table rows) and the Project Detail header, without opening the full Edit form. Click any badge/pill to open a popover selector.

- **Multi-select filters** — All filter dropdowns (RAG, Priority, Status, Area on Prime; Status and Priority in Task pane) now support selecting multiple values simultaneously. Each option has a checkbox. An empty selection shows all items.

- **Multi-sort** — Clicking column headers now builds a sort stack rather than replacing the sort. Click once to add ascending, again for descending, again to remove. Numbered indicators show sort priority. Works on both the project table and general tasks.

### Defects Fixed

- **Work log scroll containment** — The work log right pane in Project Detail now scrolls internally and no longer causes the overall page to scroll. Fixed by adding `min-h-0` constraints through the flex height chain.

- **Completed-today tasks stay visible** — Tasks completed on the current date remain visible in the "Active" filter (shown with strikethrough) until the end of day, allowing status changes to be undone if needed.

- **Due filter auto-expands projects** — Opening the Prime view with `?filter=due` in the URL (e.g. from the nav badge) now correctly auto-expands all project rows that have due or overdue tasks, even on initial page load before data was available.

- **Safari date picker dismiss** — Date pickers in the Task Modal and Project Modal now use the Calendar popover component (already used elsewhere in the app) instead of native `<input type="date">`. This fixes a Safari bug where the native date picker calendar would not dismiss when clicking elsewhere in the modal.

---

## 2.0.0

- Prime view: split-pane projects + general tasks
- Performance optimisations for startup and task mutations
- Removed legacy pages replaced by Prime
