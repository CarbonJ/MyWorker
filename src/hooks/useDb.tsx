/**
 * Database context + provider
 *
 * On first load: prompts the user to pick their OneDrive folder (if the
 * File System Access API is available). Falls back to browser-only storage in
 * unsupported browsers so the app still works.
 *
 * Stores the folder handle in IndexedDB so it only needs to be picked once.
 *
 * Every startup step is logged ("[MyWorker] …") and time-limited: browser
 * storage can hang without ever erroring (seen after a OneDrive client problem),
 * so a stuck step becomes a recovery screen naming the step, not an endless spinner.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { initDb, setUserFolderHandle, checkFolderSync, resolveFolderConflict, requestPersistentStorage, deleteWorkingCopy, type FolderConflict, type DataCounts } from '@/db'
import { rebuildAllLinks } from '@/db/notebook'
import { importLegacyJournal } from '@/db/journal'
import { purgeExpiredTrash } from '@/db/trash'
import { withTimeout, StepTimeoutError, DEFAULT_TIMEOUT_MS } from '@/lib/withTimeout'

type DbStatus = 'loading' | 'needs-folder' | 'needs-permission' | 'folder-conflict' | 'ready' | 'error' | 'unsupported'

/** What failed during startup, for the recovery screen. */
interface StartupError {
  step: string
  message: string
  /** DOMException / error name, e.g. NotFoundError, NotAllowedError, TimeoutError. */
  name: string
}

interface DbContextValue {
  status: DbStatus
  error: string | null
  pickFolder: () => Promise<void>
}

const DbContext = createContext<DbContextValue | null>(null)

const IDB_DB_NAME = 'myworker-meta'
const IDB_STORE = 'handles'
const IDB_KEY = 'folderHandle'

// Steps that read the whole database or data file get longer than the default
const OPEN_DB_TIMEOUT_MS = 30000
const FOLDER_CHECK_TIMEOUT_MS = 45000
const STARTUP_TASKS_TIMEOUT_MS = 20000

/** Steps whose failure means this browser's working copy itself can't be opened. */
const DATABASE_STEP = 'Opening the database'

/**
 * True if the File System Access API (showDirectoryPicker) is available.
 * Supported: Chrome 86+, Edge 86+
 * Not supported: Firefox (no plans), Safari (no support)
 */
const hasFSA = typeof window !== 'undefined' && 'showDirectoryPicker' in window

function log(message: string) {
  console.info(`[MyWorker] ${message}`)
}

/** Run one startup step: logged, time-limited, and labelled if it fails. */
async function step<T>(label: string, fn: () => Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  log(`${label}…`)
  try {
    return await withTimeout(fn(), ms, label)
  } catch (err) {
    console.error(`[MyWorker] failed: ${label}`, err)
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { step: label })
  }
}

function toStartupError(err: unknown, fallbackStep: string): StartupError {
  const e = err instanceof Error ? err : new Error(String(err))
  const step = err instanceof StepTimeoutError ? err.step : (e as Error & { step?: string }).step ?? fallbackStep
  return { step, message: e.message, name: e.name }
}

/** Open the small IndexedDB store that holds the folder handle. Never waits forever. */
function openHandleStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => {
      const db = req.result
      // Never hold up an upgrade started by another MyWorker tab
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('Could not open the saved-folder store'))
    req.onblocked = () => reject(new Error('Blocked by another MyWorker window — close other MyWorker tabs and retry'))
  })
}

/** Persist a FileSystemDirectoryHandle in IndexedDB so we can restore it next session */
async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await withTimeout(openHandleStore(), DEFAULT_TIMEOUT_MS, 'Opening the saved-folder store')
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Saving the folder was aborted'))
    }), DEFAULT_TIMEOUT_MS, 'Remembering the storage folder')
  } finally {
    db.close()
  }
}

/** Retrieve a previously saved FileSystemDirectoryHandle from IndexedDB */
async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleStore()
  try {
    return await new Promise((resolve, reject) => {
      const getReq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY)
      getReq.onsuccess = () => resolve((getReq.result as FileSystemDirectoryHandle | undefined) ?? null)
      getReq.onerror = () => reject(getReq.error)
    })
  } finally {
    db.close()
  }
}

/** Forget the saved folder (only the handle — never the database or any file). */
async function forgetHandle(): Promise<void> {
  const db = await withTimeout(openHandleStore(), DEFAULT_TIMEOUT_MS, 'Opening the saved-folder store')
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }), DEFAULT_TIMEOUT_MS, 'Forgetting the storage folder')
  } finally {
    db.close()
  }
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DbStatus>('loading')
  const [error, setError] = useState<StartupError | null>(null)
  const [conflict, setConflict] = useState<FolderConflict | null>(null)
  const [resolving, setResolving] = useState(false)
  const [currentStep, setCurrentStep] = useState('Starting')
  // A saved folder waiting for the user to re-grant access (needs a click)
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const fail = useCallback((err: unknown, fallbackStep: string) => {
    setError(toStartupError(err, fallbackStep))
    setStatus('error')
  }, [])

  const run = useCallback(<T,>(label: string, fn: () => Promise<T>, ms?: number) => {
    setCurrentStep(label)
    return step(label, fn, ms)
  }, [])

  const finishStartup = useCallback(async () => {
    // Move journal text older versions kept in localStorage into the database
    await importLegacyJournal().catch(err => console.warn('[db] importLegacyJournal:', err))
    // Drop trash items past their restore window
    await run('Tidying the Trash', () => purgeExpiredTrash(), STARTUP_TASKS_TIMEOUT_MS)
      .catch(err => console.warn('[db] purgeExpiredTrash:', err))
    // Re-index notebook backlinks on every startup — fast and idempotent,
    // ensures stale link data from earlier bugs is corrected before any page renders.
    rebuildAllLinks().catch(err => console.warn('[db] rebuildAllLinks:', err))
    // Ask the browser not to clear this site's storage (the working copy) when disk space runs low
    requestPersistentStorage().catch(() => {})
    log('ready')
    setStatus('ready')
  }, [run])

  const initialise = useCallback(async (handle: FileSystemDirectoryHandle | null) => {
    try {
      setStatus('loading')
      await run(DATABASE_STEP, () => initDb(handle), OPEN_DB_TIMEOUT_MS)
      log('database open')
      if (handle) await run('Remembering the storage folder', () => saveHandle(handle))
      // Before anything is written to the folder: is its file newer than this browser's data?
      const found = await run('Checking the data file in your storage folder', () => checkFolderSync(), FOLDER_CHECK_TIMEOUT_MS)
      if (found) {
        log('folder file differs from this browser — asking which to keep')
        setConflict(found)
        setStatus('folder-conflict')
        return
      }
      await finishStartup()
    } catch (e) {
      fail(e, DATABASE_STEP)
    }
  }, [finishStartup, fail, run])

  const resolveConflict = useCallback(async (choice: 'folder' | 'local') => {
    setResolving(true)
    try {
      await resolveFolderConflict(choice)
      setConflict(null)
      await finishStartup()
    } catch (e) {
      fail(e, choice === 'folder' ? 'Loading the folder file' : 'Saving this browser\'s data to the folder')
    } finally {
      setResolving(false)
    }
  }, [finishStartup, fail])

  // Restore the saved folder handle, or decide what to show. Only queries
  // permission: a request needs a click, so a lapsed grant shows a button.
  const restore = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      if (!hasFSA) {
        // File System Access API not available — data lives in browser storage only
        log('no folder access in this browser — using browser storage only')
        await initialise(null)
        return
      }
      const handle = await run('Opening the saved-folder store', () => loadHandle())
      if (!handle) {
        log('no saved folder')
        setStatus('needs-folder')
        return
      }
      log(`saved folder found: ${handle.name}`)
      const permission = await run('Checking folder permission', () => handle.queryPermission({ mode: 'readwrite' }))
      log(`permission: ${permission}`)
      if (permission === 'granted') {
        await initialise(handle)
      } else {
        setPendingHandle(handle)
        setStatus('needs-permission')
      }
    } catch (err) {
      fail(err, 'Opening the saved-folder store')
    }
  }, [initialise, fail, run])

  useEffect(() => { restore() }, [restore])

  const pickFolder = useCallback(async () => {
    if (!hasFSA) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await initialise(handle)
    } catch (e) {
      // User cancelled — stay where they were
      if (e instanceof Error && e.name !== 'AbortError') fail(e, 'Choosing the storage folder')
    }
  }, [initialise, fail])

  // Click handler: re-grant access to the saved folder, or pick it again
  const reconnect = useCallback(async () => {
    const handle = pendingHandle
    if (!handle) { await pickFolder(); return }
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' })
      log(`permission after asking: ${permission}`)
      if (permission === 'granted') {
        setPendingHandle(null)
        await initialise(handle)
        return
      }
    } catch (err) {
      console.warn('[MyWorker] requestPermission failed — falling back to the folder picker', err)
    }
    await pickFolder()
  }, [pendingHandle, initialise, pickFolder])

  const resetSavedFolder = useCallback(async () => {
    try {
      await forgetHandle()
    } catch (err) {
      // The store itself is stuck: delete it outright (it holds only the folder handle)
      console.warn('[MyWorker] could not clear the saved folder; deleting its store', err)
      indexedDB.deleteDatabase(IDB_DB_NAME)
    }
    window.location.reload()
  }, [])

  const rebuildFromFolder = useCallback(async () => {
    if (!confirm(
      "Delete this browser's copy of your data and load it again from the data file in your storage folder?\n\n" +
      'Only do this if the database will not open. Changes made in this browser since its last successful save to the folder will be lost. ' +
      'The data file itself is not touched — after reloading you choose the storage folder and confirm loading its file.',
    )) return
    await withTimeout(deleteWorkingCopy(), DEFAULT_TIMEOUT_MS, 'Deleting the working copy').catch(err =>
      console.warn('[MyWorker] working copy delete is pending until reload', err))
    window.location.reload()
  }, [])

  return (
    <DbContext.Provider value={{ status, error: error?.message ?? null, pickFolder }}>
      {status === 'needs-folder' && (
        <FolderPickerScreen onPick={pickFolder} />
      )}
      {status === 'needs-permission' && (
        <ReconnectScreen folderName={pendingHandle?.name ?? ''} onReconnect={reconnect} onPickOther={pickFolder} />
      )}
      {status === 'loading' && (
        <LoadingScreen key={currentStep} step={currentStep} />
      )}
      {status === 'folder-conflict' && conflict && (
        <FolderConflictScreen conflict={conflict} busy={resolving} onResolve={resolveConflict} />
      )}
      {status === 'error' && (
        <ErrorScreen
          error={error}
          canPickFolder={hasFSA}
          onRetry={restore}
          onPickFolder={pickFolder}
          onResetSavedFolder={resetSavedFolder}
          onRebuild={error?.step === DATABASE_STEP ? rebuildFromFolder : undefined}
        />
      )}
      {status === 'ready' && children}
    </DbContext.Provider>
  )
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used within DbProvider')
  return ctx
}

// ── Inline screens shown before the app is ready ──────────────────────────────

function FolderPickerScreen({ onPick }: { onPick: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Welcome to MyWorker</h1>
          <p className="text-muted-foreground">
            MyWorker stores your data in a folder you choose — ideally your OneDrive folder,
            so it stays backed up and synced across devices.
          </p>
        </div>
        <button
          onClick={onPick}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-3 font-medium hover:bg-primary/90 transition-colors"
        >
          Choose storage folder
        </button>
        <p className="text-xs text-muted-foreground">
          You'll only need to do this once per browser session.
        </p>
        <p className="text-xs text-muted-foreground">
          Folder sync requires <strong>Chrome</strong> or <strong>Edge</strong>.
          Firefox and Safari are not supported for this feature.
        </p>
      </div>
    </div>
  )
}

function fmtWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'unknown'
}

function fmtCounts(c: DataCounts): string {
  return `${c.projects} projects · ${c.tasks} tasks · ${c.workLogEntries} log entries · ${c.notebookPages} notes`
}

function FolderConflictScreen({ conflict, busy, onResolve }: {
  conflict: FolderConflict
  busy: boolean
  onResolve: (choice: 'folder' | 'local') => void
}) {
  const folderIsNewer = !conflict.localChangedAt ||
    (!!conflict.fileSavedAt && conflict.fileSavedAt > conflict.localChangedAt)
  const card = 'rounded-md border p-4 space-y-1 text-left'
  const btn = 'w-full rounded-md px-4 py-2 font-medium transition-colors disabled:opacity-50'
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-xl w-full p-8 space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Your data file was changed elsewhere</h1>
          <p className="text-sm text-muted-foreground">
            The data file in your storage folder doesn't match this browser's copy — usually because
            MyWorker was used on another laptop or browser. Choose which copy to keep. The other copy
            is saved in the folder as a <span className="font-mono">myworker-conflict-…json</span> file,
            which you can import later from Settings.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={card}>
            <p className="font-medium text-sm">Folder file{folderIsNewer && <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">newer</span>}</p>
            <p className="text-xs text-muted-foreground">Saved {fmtWhen(conflict.fileSavedAt)}</p>
            <p className="text-xs text-muted-foreground">{fmtCounts(conflict.fileCounts)}</p>
            <button
              disabled={busy}
              onClick={() => onResolve('folder')}
              className={`${btn} mt-2 ${folderIsNewer ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-accent'}`}
            >
              Load folder file
            </button>
          </div>
          <div className={card}>
            <p className="font-medium text-sm">This browser{!folderIsNewer && <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">newer</span>}</p>
            <p className="text-xs text-muted-foreground">Last change {fmtWhen(conflict.localChangedAt)}</p>
            <p className="text-xs text-muted-foreground">{fmtCounts(conflict.localCounts)}</p>
            <button
              disabled={busy}
              onClick={() => onResolve('local')}
              className={`${btn} mt-2 ${!folderIsNewer ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-accent'}`}
            >
              Keep this browser's data
            </button>
          </div>
        </div>
        {busy && <p className="text-sm text-muted-foreground text-center">Working…</p>}
      </div>
    </div>
  )
}

function LoadingScreen({ step }: { step: string }) {
  // After a few seconds, say what it's waiting on (each step gives up on its own if stuck).
  // Keyed by step, so it starts over for each one.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Opening database…</p>
        {slow && <p className="text-xs text-muted-foreground">Still working: {step}</p>}
      </div>
    </div>
  )
}

function ReconnectScreen({ folderName, onReconnect, onPickOther }: {
  folderName: string
  onReconnect: () => void
  onPickOther: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center space-y-5">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Reconnect your storage folder</h1>
          <p className="text-sm text-muted-foreground">
            The browser needs your OK to use the folder{folderName && <> <span className="font-mono">{folderName}</span></>} again.
            Your data is safe — this only restores access.
          </p>
        </div>
        <button onClick={onReconnect}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-3 font-medium hover:bg-primary/90 transition-colors">
          Reconnect storage folder
        </button>
        <button onClick={onPickOther} className="text-sm text-muted-foreground hover:text-foreground underline">
          Choose a different folder
        </button>
      </div>
    </div>
  )
}

/** Plain-language hint for the usual error names. */
function explain(error: StartupError): string {
  switch (error.name) {
    case 'TimeoutError': return 'It stopped responding. This can happen when OneDrive has a problem with the file or folder — check OneDrive is running and the file is downloaded, then retry.'
    case 'NotFoundError': return 'The folder or data file could not be found — it may have been moved, renamed, or OneDrive re-linked to a different location. Choose the folder again.'
    case 'NotAllowedError': return 'The browser refused access to the folder. Choose the folder again to grant access.'
    case 'SecurityError': return 'The browser blocked access for security reasons. Choose the folder again from a click.'
    case 'InvalidStateError': return 'The file changed while it was being read (often OneDrive syncing). Retry in a moment.'
    default: return 'Retry, or choose the storage folder again.'
  }
}

function ErrorScreen({ error, canPickFolder, onRetry, onPickFolder, onResetSavedFolder, onRebuild }: {
  error: StartupError | null
  canPickFolder: boolean
  onRetry: () => void
  onPickFolder: () => void
  onResetSavedFolder: () => void
  onRebuild?: () => void
}) {
  const btn = 'w-full rounded-md px-4 py-2 font-medium transition-colors'
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-lg w-full p-8 space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold text-destructive">MyWorker couldn't start</h1>
          {error && (
            <>
              <p className="text-sm">Stopped at: <span className="font-medium">{error.step}</span></p>
              <p className="text-sm text-muted-foreground">{explain(error)}</p>
              <p className="text-xs text-muted-foreground font-mono break-words">{error.name}: {error.message}</p>
            </>
          )}
        </div>
        <div className="space-y-2">
          <button onClick={onRetry} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>Retry</button>
          {canPickFolder && (
            <button onClick={onPickFolder} className={`${btn} border hover:bg-accent`}>Choose storage folder</button>
          )}
          {canPickFolder && (
            <button onClick={onResetSavedFolder} className={`${btn} border hover:bg-accent`}
              title="Forgets which folder was chosen and reloads. Your data and the data file are not touched.">
              Forget saved folder and reload
            </button>
          )}
          {onRebuild && (
            <button onClick={onRebuild} className={`${btn} border border-destructive/40 text-destructive hover:bg-destructive/10`}>
              Rebuild this browser's copy from the folder file…
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          None of these change the data file in your storage folder. The browser console shows each startup step as “[MyWorker] …”.
        </p>
      </div>
    </div>
  )
}

// Export for Settings screen use
export { setUserFolderHandle }
