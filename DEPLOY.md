# MyWorker — Deployment Guide

How to package MyWorker on the dev machine and install it on any target machine.

---

## Prerequisites

### Dev machine (packaging)
- Node.js + npm
- `zip` command-line tool (built into macOS/Linux; on Windows use WSL or Git Bash)

### Target machine (running the app)
- Python 3 (or Python 2.7 as fallback) — just needs to be on the PATH
- Google Chrome (recommended) or Microsoft Edge
- No Node.js, no internet connection, no installation required

---

## Step 1 — Package the app (dev machine)

From the project root, run:

```bash
./build-and-package.sh
```

This will:
1. Run `npm run build` to compile the app into the `dist/` folder
2. Copy all three launcher scripts into `dist/`
3. Zip everything into **`myworker-app.zip`**

Transfer `myworker-app.zip` to the target machine via USB, OneDrive, email, etc.

---

## Step 2 — Install on the target machine

1. Create a folder for the app, e.g.:
   - Windows: `C:\MyWorker\`
   - macOS/Linux: `~/MyWorker/`

2. Unzip `myworker-app.zip` into that folder.

   The folder should contain `index.html`, `assets/`, and the launcher scripts.

---

## Step 3 — Launch the app

### Windows
Double-click **`launch-myworker.bat`**

A terminal window opens, the server starts, and Chrome opens automatically at `http://localhost:3000`.
**Keep the terminal window open** while using the app. Close it to stop the server.

### macOS
Double-click **`launch-myworker.command`**

> First time only: macOS may block the file. If so, right-click → Open → Open.
> You may also need to allow it in **System Settings → Privacy & Security**.

Terminal opens, the server starts, and your default browser opens at `http://localhost:3000`.

Alternatively, from Terminal:
```bash
chmod +x ~/MyWorker/launch-myworker.sh
~/MyWorker/launch-myworker.sh
```

### Linux
From a terminal:
```bash
chmod +x ~/MyWorker/launch-myworker.sh
~/MyWorker/launch-myworker.sh
```

The server starts and the browser opens at `http://localhost:3000` (requires a desktop environment for auto-open).

---

## Step 4 — First-time database setup

On first launch, MyWorker will prompt you to choose a folder for the database file.

1. Click **Choose folder** when prompted
2. Select a folder — ideally inside your **OneDrive** folder so the database syncs across machines and benefits from OneDrive's version history
3. MyWorker creates `myworker.db` in that folder and initialises the database automatically

> **OneDrive tip:** The database file (`myworker.db`) is the only file that holds your data. Everything else in the app folder is the application itself and can be safely replaced during updates.

---

## Updating the app

When a new version is available:

1. On the dev machine, run `./build-and-package.sh` again
2. Transfer the new `myworker-app.zip` to the target machine
3. Unzip into the **same folder**, overwriting all existing app files
   - The database file is stored separately (in your OneDrive folder) and is **never affected**
4. Relaunch using the same launcher script

Database schema changes (new features that require new columns or tables) are applied automatically on first launch — no manual steps needed.

---

## Auto-start on login (optional)

### Windows
1. Press `Win + R`, type `shell:startup`, press Enter
2. Create a shortcut to `launch-myworker.bat` in the Startup folder

### macOS
1. Go to **System Settings → General → Login Items**
2. Click `+` and add `launch-myworker.command`

### Linux (systemd user service)
Create `~/.config/systemd/user/myworker.service`:
```ini
[Unit]
Description=MyWorker

[Service]
WorkingDirectory=%h/MyWorker
ExecStart=python3 -m http.server 3000
Restart=on-failure

[Install]
WantedBy=default.target
```
Then run:
```bash
systemctl --user enable myworker
systemctl --user start myworker
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `python3` not found (Windows) | Install Python from python.org — tick "Add to PATH" during install |
| Port 3000 already in use | Edit the launcher script and change `3000` to another port (e.g. `3001`) |
| macOS blocks `.command` file | Right-click → Open, then confirm in Privacy & Security settings |
| Browser shows a blank page | Wait a second and refresh — the server may still be starting |
| Database not found on relaunch | Click "Choose folder" and re-select your OneDrive folder containing `myworker.db` |
