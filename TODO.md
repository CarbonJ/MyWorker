# MyWorker TODO

**Purpose:** Record needed fixes, features, etc. Also record questions about planning or features that are not feasible.

## Questions - Do not implement, just research and if answered, mark complete
- [x] Is there a custom keyboard shortcut I could add to perform the task quick entry?
  > **Yes — implemented.** `Cmd+L` / `Ctrl+L` opens the Quick Add inbox task modal globally (see `App.tsx`). (`Cmd+N` was tried but browsers intercept it for "new window" and it cannot be overridden.)
- [x] Can I query/update the SQLite database directly? If yes, how?
  > **Yes.** Use **DB Browser for SQLite** (free GUI app, sqlitebrowser.org) to open `myworker.db` directly — browse tables, run SQL, edit rows. Or use the `sqlite3` CLI.
  > ⚠️ Don't write to the DB while MyWorker is running — wa-sqlite holds the file open. Safe to read any time; safe to write when the app is closed.

- [x] What key shortcuts can be implemented or not? Examples:
  - [x] `Esc` to return to main screen → **Feasible.** Global `keydown` listener, navigates to `/` when no modal open.
  - [x] `Cmd+N` to open a quick task entry modal → **Feasible.** Global `keydown` listener opens Quick Add modal.

- [x] Is it possible to create tasks while browser is not main focus?
  - [x] Can I call a macOS shortcut to initiate something in the browser / make a DB entry directly?
  > **No (browser shortcuts) / Risky (direct DB).** Browsers cannot intercept system-level keystrokes when not the active window — hard security boundary. Direct DB writes via SQLite CLI are possible while the app is closed, but bypass app validation and migration logic — not recommended for routine use.

## Minor - Can implement and mark complete.
- [x] Keyboard shortcut: `Esc` to return to main screen (global `keydown` listener, navigate to `/` when no modal open)
  - [x] Ensure does not break any browser (Firefox, Chrome, or Safari functionality)
- [x] Keyboard shortcut: `Cmd+L` to open Quick Add inbox task modal (global `keydown` listener)
  - [x] Ensure does not break any browser (Firefox, Chrome, or Safari functionality)
- [x] In the New Project screen, the example/default text of the Work Item should change to something more agnostic
- [x] In the Edit Project screen, rather than a single text box for stake holders, use the same concept as the JIRA entry.  There might be N+1 number of stake holders.
  - [x] In the Project details panel, put the Stakeholders into their own pill with a white background
- [x] Add a default-data import file with three priorities already established. (`default-data.json` in project root — import via Settings → Data → Import backup)
- [x] In the Projects screen Latest Update column, display date as MM/DD (no year).
- [x] In the Data tab of the Settings screen, display current data usage/record counts.

## Major - Do not auto implement. Review, ask about, and determine plans first. Mark complete when done.

- [ ] Exported Markdown Report Formatting — needs more space / better layout.
