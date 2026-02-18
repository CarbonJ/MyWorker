/**
 * Database context + provider
 *
 * On first load: prompts the user to pick their OneDrive folder.
 * Stores the folder handle in IndexedDB (via the handle persistence trick)
 * so the user only needs to pick once per browser session.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { initDb, setUserFolderHandle } from '@/db'

type DbStatus = 'loading' | 'needs-folder' | 'ready' | 'error'

interface DbContextValue {
  status: DbStatus
  error: string | null
  pickFolder: () => Promise<void>
}

const DbContext = createContext<DbContextValue | null>(null)

const IDB_DB_NAME = 'myworker-meta'
const IDB_STORE = 'handles'
const IDB_KEY = 'folderHandle'

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

  const initialise = useCallback(async (handle: FileSystemDirectoryHandle) => {
    try {
      setStatus('loading')
      await initDb(handle)
      await saveHandle(handle)
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [])

  // On mount: try to restore the saved folder handle
  useEffect(() => {
    async function restore() {
      try {
        const handle = await loadHandle()
        if (handle && (await verifyPermission(handle))) {
          await initialise(handle)
        } else {
          setStatus('needs-folder')
        }
      } catch {
        setStatus('needs-folder')
      }
    }
    restore()
  }, [initialise])

  const pickFolder = useCallback(async () => {
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

// Export changeFolder for Settings screen use
export { setUserFolderHandle }
