# MyWorker TODO

**Purpose:** Record needed fixes, features, etc. Also record questions about planning or features that are not feasible.

## Questions - Do not implement, just research and if answered, mark complete

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

- [x] Add a default-data import file with three priorities already established. (`default-data.json` in project root — import via Settings → Data → Import backup)
- [x] In the Projects screen Latest Update column, display date as MM/DD (no year).
- [x] In the Data tab of the Settings screen, display current data usage/record counts.

## Major - Do not auto implement. Review, ask about, and determine plans first. Mark complete when done.

- [ ] Exported Markdown Report Formatting — needs more space / better layout.
