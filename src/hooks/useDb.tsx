/**
 * Database context + provider
 *
 * On first load: prompts the user to pick their OneDrive folder (if the
 * File System Access API is available). Falls back to OPFS-only mode in
 * unsupported browsers so the app still works.
 *
 * Stores the folder handle in IndexedDB so it only needs to be picked once
 * per browser session.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { initDb, setUserFolderHandle, checkFolderSync, resolveFolderConflict, type FolderConflict, type DataCounts } from '@/db'
import { rebuildAllLinks } from '@/db/notebook'
import { importLegacyJournal } from '@/db/journal'
import { purgeExpiredTrash } from '@/db/trash'

type DbStatus = 'loading' | 'needs-folder' | 'folder-conflict' | 'ready' | 'error' | 'unsupported'

interface DbContextValue {
  status: DbStatus
  error: string | null
  pickFolder: () => Promise<void>
}

const DbContext = createContext<DbContextValue | null>(null)

const IDB_DB_NAME = 'myworker-meta'
const IDB_STORE = 'handles'
const IDB_KEY = 'folderHandle'

/**
 * True if the File System Access API (showDirectoryPicker) is available.
 * Supported: Chrome 86+, Edge 86+
 * Not supported: Firefox (no plans), Safari (no support)
 */
const hasFSA = typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Persist a FileSystemDirectoryHandle in IndexedDB so we can restore it next session */
async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Retrieve a previously saved FileSystemDirectoryHandle from IndexedDB */
async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readonly')
      const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY)
      getReq.onsuccess = () => resolve((getReq.result as FileSystemDirectoryHandle) ?? null)
      getReq.onerror = () => reject(getReq.error)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Check if we still have permission to the stored handle */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DbStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<FolderConflict | null>(null)
  const [resolving, setResolving] = useState(false)

  const finishStartup = useCallback(async () => {
    // Move journal text older versions kept in localStorage into the database
    await importLegacyJournal().catch(err => console.warn('[db] importLegacyJournal:', err))
    // Drop trash items past their restore window
    await purgeExpiredTrash().catch(err => console.warn('[db] purgeExpiredTrash:', err))
    // Re-index notebook backlinks on every startup — fast and idempotent,
    // ensures stale link data from earlier bugs is corrected before any page renders.
    rebuildAllLinks().catch(err => console.warn('[db] rebuildAllLinks:', err))
    setStatus('ready')
  }, [])

  const initialise = useCallback(async (handle: FileSystemDirectoryHandle | null) => {
    try {
      setStatus('loading')
      await initDb(handle)
      if (handle) await saveHandle(handle)
      // Before anything is written to the folder: is its file newer than this browser's data?
      const found = await checkFolderSync()
      if (found) {
        setConflict(found)
        setStatus('folder-conflict')
        return
      }
      await finishStartup()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [finishStartup])

  const resolveConflict = useCallback(async (choice: 'folder' | 'local') => {
    setResolving(true)
    try {
      await resolveFolderConflict(choice)
      setConflict(null)
      await finishStartup()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    } finally {
      setResolving(false)
    }
  }, [finishStartup])

  // On mount: restore saved handle or decide what state to show
  useEffect(() => {
    async function restore() {
      try {
        if (hasFSA) {
          // Try to restore a saved folder handle
          const handle = await loadHandle()
          if (handle && (await verifyPermission(handle))) {
            await initialise(handle)
          } else {
            setStatus('needs-folder')
          }
        } else {
          // File System Access API not available — run in OPFS-only mode
          // Data lives in browser storage only (no OneDrive sync)
          await initialise(null)
        }
      } catch (err) {
        console.error('[db] Failed to restore saved folder handle', err)
        setStatus('needs-folder')
      }
    }
    restore()
  }, [initialise])

  const pickFolder = useCallback(async () => {
    if (!hasFSA) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await initialise(handle)
    } catch (e) {
      // User cancelled — stay on needs-folder screen
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(e.message)
        setStatus('error')
      }
    }
  }, [initialise])

  return (
    <DbContext.Provider value={{ status, error, pickFolder }}>
      {status === 'needs-folder' && (
        <FolderPickerScreen onPick={pickFolder} />
      )}
      {status === 'loading' && (
        <LoadingScreen />
      )}
      {status === 'folder-conflict' && conflict && (
        <FolderConflictScreen conflict={conflict} busy={resolving} onResolve={resolveConflict} />
      )}
      {status === 'error' && (
        <ErrorScreen error={error} onRetry={() => setStatus('needs-folder')} />
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

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Opening database…</p>
      </div>
    </div>
  )
}

function ErrorScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-destructive">Failed to open database</h1>
        {error && <p className="text-sm text-muted-foreground font-mono">{error}</p>}
        <button
          onClick={onRetry}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

// Export for Settings screen use
export { setUserFolderHandle }
