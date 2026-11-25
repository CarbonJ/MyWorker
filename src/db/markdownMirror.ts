/**
 * Writes the markdown mirror (lib/markdownMirror.ts) into the storage folder:
 * MyWorkerMarkdown/, a readable copy of everything, refreshed once a day after
 * the first folder save (and on demand from Settings → Data).
 *
 * Only files whose content changed are rewritten, so OneDrive syncs little and
 * its version history stays meaningful. A manifest in the folder records the
 * files this app wrote and a checksum of each; a file the app wrote earlier
 * that no longer belongs (a deleted or renamed record) is removed. Files the
 * user adds to the folder are never touched.
 *
 * Every folder call is time-limited, and a failure is logged, never shown: the
 * main save has already succeeded, and tomorrow's run tries again.
 */

import { getStorageFolder, onAfterFolderSave, snapshotUserData } from './index'
import { getAssetsFolderName } from './assets'
import { buildMarkdownMirror, MIRROR_FOLDER } from '@/lib/markdownMirror'
import { crc32 } from '@/lib/noteExport'
import { localToday } from '@/lib/utils'
import { withTimeout } from '@/lib/withTimeout'

export { MIRROR_FOLDER }

const MANIFEST = '.myworker-mirror.json'
// Device-local display state, so not under the myworker: prefix that backups collect
const MIRROR_STATUS_KEY = 'mw-markdown-mirror-status'
/** Window event fired when a mirror run finishes (Settings shows the result). */
export const MIRROR_EVENT = 'myworker:markdown-mirror'

interface Manifest {
  /** Local date of the last complete run. */
  date: string
  /** Path (relative to the mirror folder) → crc32 of the content written. */
  files: Record<string, number>
}

export interface MirrorResult {
  date: string
  files: number
  written: number
  removed: number
}

const step = <T>(p: Promise<T>, label: string) => withTimeout(p, 10_000, `Markdown copy: ${label}`)

async function readManifest(root: FileSystemDirectoryHandle): Promise<Manifest | null> {
  try {
    const file = await step(root.getFileHandle(MANIFEST).then(h => h.getFile()), 'reading manifest')
    const parsed = JSON.parse(await file.text())
    return parsed && typeof parsed.files === 'object' ? parsed as Manifest : null
  } catch {
    return null
  }
}

async function folderFor(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<[FileSystemDirectoryHandle, string]> {
  const parts = path.split('/')
  const name = parts.pop()!
  let dir = root
  for (const part of parts) dir = await step(dir.getDirectoryHandle(part, { create }), `opening ${part}`)
  return [dir, name]
}

async function exists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  try {
    const [dir, name] = await folderFor(root, path, false)
    await step(dir.getFileHandle(name), `checking ${path}`)
    return true
  } catch {
    return false
  }
}

async function writeText(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const [dir, name] = await folderFor(root, path, true)
  const handle = await step(dir.getFileHandle(name, { create: true }), `creating ${path}`)
  const writable = await step(handle.createWritable(), `opening ${path}`)
  try {
    await step(writable.write(content), `writing ${path}`)
    await step(writable.close(), `saving ${path}`)
  } catch (err) {
    await writable.abort().catch(() => {})
    throw err
  }
}

let running: Promise<MirrorResult | null> | null = null

/**
 * Bring the mirror up to date from `data` (a snapshotUserData() result).
 * Without `force` it runs at most once a day. Returns null when skipped.
 */
export function writeMarkdownMirror(dir: FileSystemDirectoryHandle, data: Record<string, unknown>, force = false): Promise<MirrorResult | null> {
  if (running) return running
  running = run(dir, data, force).finally(() => { running = null })
  return running
}

async function run(dir: FileSystemDirectoryHandle, data: Record<string, unknown>, force: boolean): Promise<MirrorResult | null> {
  const today = localToday()
  const root = await step(dir.getDirectoryHandle(MIRROR_FOLDER, { create: true }), 'opening folder')
  const previous = await readManifest(root)
  if (!force && previous?.date === today) return null

  const started = performance.now()
  const files = buildMarkdownMirror(data, { assetsFolder: getAssetsFolderName(), today })
  const encoder = new TextEncoder()
  const next: Record<string, number> = {}
  let written = 0
  for (const [path, content] of files) {
    const sum = crc32(encoder.encode(content))
    next[path] = sum
    if (previous?.files[path] === sum && await exists(root, path)) continue
    await writeText(root, path, content)
    written++
  }

  // Remove what this app wrote before that no longer belongs. A path that differs
  // only in capitals from a current one is the same file on Windows and macOS.
  const current = new Set(Object.keys(next).map(p => p.toLowerCase()))
  let removed = 0
  for (const path of Object.keys(previous?.files ?? {})) {
    if (current.has(path.toLowerCase())) continue
    try {
      const [folder, name] = await folderFor(root, path, false)
      await step(folder.removeEntry(name), `removing ${path}`)
      removed++
    } catch { /* already gone */ }
  }

  await writeText(root, MANIFEST, JSON.stringify({ date: today, files: next } satisfies Manifest))
  const result = { date: today, files: files.size, written, removed }
  console.info(`[MyWorker] Markdown copy updated: ${written} written, ${removed} removed, ${files.size} files (${Math.round(performance.now() - started)} ms)`)
  try { localStorage.setItem(MIRROR_STATUS_KEY, JSON.stringify(result)) } catch { /* display only */ }
  window.dispatchEvent(new Event(MIRROR_EVENT))
  return result
}

/** The last run in this browser, for display in Settings. */
export function getLastMirrorResult(): MirrorResult | null {
  try {
    const raw = localStorage.getItem(MIRROR_STATUS_KEY)
    return raw ? JSON.parse(raw) as MirrorResult : null
  } catch {
    return null
  }
}

/** Settings → "Update now": rewrite the mirror from the current data. */
export async function updateMarkdownMirrorNow(): Promise<MirrorResult | null> {
  const dir = getStorageFolder()
  if (!dir) throw new Error('No storage folder is set')
  return writeMarkdownMirror(dir, await snapshotUserData(), true)
}

/** Call once at startup: the daily run follows the first folder save each day. */
export function startMarkdownMirror(): void {
  onAfterFolderSave((dir, data) => {
    writeMarkdownMirror(dir, data).catch(err => console.warn('[db] Markdown copy failed', err))
  })
}
