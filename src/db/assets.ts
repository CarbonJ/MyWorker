import { getDb } from './index'

// ── Image asset storage ────────────────────────────────────────────────────
// Pasted images are written as individual files into a subfolder next to
// myworker-data.json (default "MyWorkerAssets", configurable in Settings → Data).
// The reference lives INLINE in the note markdown as a custom image src:
//   ![alt](asset://<filename>?w=25)      inline image at 25% of note width
//   ![alt](asset://<filename>?d=link)    shown as a compact link/chip
// Because the reference travels with the note text, no DB table/migration is
// needed — only the image bytes are external. This feature requires the File
// System Access API (Edge/Chrome with a chosen storage folder).

const ASSETS_FOLDER_KEY = 'myworker:assets-folder'
export const DEFAULT_ASSETS_FOLDER = 'MyWorkerAssets'

/** The configured assets subfolder name (falls back to the default). */
export function getAssetsFolderName(): string {
  const v = localStorage.getItem(ASSETS_FOLDER_KEY)?.trim()
  return v || DEFAULT_ASSETS_FOLDER
}

/**
 * Folder names used before the current one. Renaming the setting doesn't move
 * files, so images saved under an earlier name are still read from there.
 */
const ASSETS_FOLDER_HISTORY_KEY = 'myworker:assets-folder-history'

function previousAssetsFolders(): string[] {
  let history: string[] = []
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSETS_FOLDER_HISTORY_KEY) ?? '[]')
    if (Array.isArray(parsed)) history = parsed.filter((n): n is string => typeof n === 'string')
  } catch { /* unreadable history — fall back to the default folder only */ }
  const current = getAssetsFolderName()
  return [...new Set([...history, DEFAULT_ASSETS_FOLDER])].filter(n => n !== current)
}

export function setAssetsFolderName(name: string): void {
  const clean = name.trim() || DEFAULT_ASSETS_FOLDER
  const current = getAssetsFolderName()
  if (clean === current) return
  const history = previousAssetsFolders().filter(n => n !== clean)
  localStorage.setItem(ASSETS_FOLDER_HISTORY_KEY, JSON.stringify([current, ...history]))
  localStorage.setItem(ASSETS_FOLDER_KEY, clean)
}

/** True when image paste/storage is available (FSA supported + a folder chosen). */
export function assetsSupported(): boolean {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return false
  try {
    return !!getDb().dirHandle
  } catch {
    // DB not initialised yet
    return false
  }
}

/** Resolve the assets subfolder handle, or null when unavailable. */
export async function getAssetsDir(create = false): Promise<FileSystemDirectoryHandle | null> {
  let dirHandle: FileSystemDirectoryHandle | null = null
  try {
    dirHandle = getDb().dirHandle
  } catch {
    return null
  }
  if (!dirHandle) return null
  try {
    return await dirHandle.getDirectoryHandle(getAssetsFolderName(), { create })
  } catch {
    return null
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
}

function extForBlob(blob: Blob): string {
  return EXT_BY_MIME[blob.type] ?? '.png'
}

/**
 * Write an image blob (as-is, lossless) into the assets folder and return the
 * generated filename. Throws if the assets folder is unavailable.
 */
export async function saveAssetImage(blob: Blob): Promise<string> {
  const dir = await getAssetsDir(true)
  if (!dir) throw new Error('No storage folder available for image assets.')
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 8)
  const filename = `paste-${stamp}-${rand}${extForBlob(blob)}`
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
  return filename
}

/**
 * Read an image file as a Blob, or null if missing. Looks in the current assets
 * folder first, then in folders the setting pointed at before it was changed.
 */
export async function readAssetBlob(filename: string): Promise<Blob | null> {
  let root: FileSystemDirectoryHandle | null = null
  try { root = getDb().dirHandle } catch { return null }
  if (!root) return null
  for (const folder of [getAssetsFolderName(), ...previousAssetsFolders()]) {
    try {
      const dir = await root.getDirectoryHandle(folder, { create: false })
      const fileHandle = await dir.getFileHandle(filename, { create: false })
      return await fileHandle.getFile()
    } catch {
      // Not in this folder — try the next one
    }
  }
  return null
}

/** Delete an image file from the assets folder (ignores a missing file). */
export async function deleteAssetImage(filename: string): Promise<void> {
  const dir = await getAssetsDir(false)
  if (!dir) return
  try {
    await dir.removeEntry(filename)
  } catch {
    // Already gone — nothing to do.
  }
  revokeAssetUrl(filename)
}

// ── Object-URL cache ────────────────────────────────────────────────────────
// Filenames are immutable once written, so an object URL can be cached and
// reused across renders. Revoked on delete.
const urlCache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

/** Resolve a cached object URL for an asset file (reads the file once). */
export async function getAssetUrl(filename: string): Promise<string | null> {
  const cached = urlCache.get(filename)
  if (cached) return cached
  const inflight = pending.get(filename)
  if (inflight) return inflight
  const p = (async () => {
    const blob = await readAssetBlob(filename)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(filename, url)
    return url
  })().finally(() => pending.delete(filename))
  pending.set(filename, p)
  return p
}

export function revokeAssetUrl(filename: string): void {
  const url = urlCache.get(filename)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(filename)
  }
}

// ── Markdown src parsing/building ────────────────────────────────────────────

export type AssetDisplay = 'image' | 'link'
export interface AssetSrcParts {
  filename: string
  width: number      // percent of note width (image mode)
  display: AssetDisplay
}

export const DEFAULT_ASSET_WIDTH = 25

/** Parse an `asset://name?w=..&d=..` src into its parts, or null if not an asset src. */
export function parseAssetSrc(src: string | undefined | null): AssetSrcParts | null {
  if (!src || !src.startsWith('asset://')) return null
  const rest = src.slice('asset://'.length)
  const qIdx = rest.indexOf('?')
  const filename = decodeURIComponent(qIdx === -1 ? rest : rest.slice(0, qIdx))
  const params = new URLSearchParams(qIdx === -1 ? '' : rest.slice(qIdx + 1))
  const w = Number(params.get('w'))
  const width = Number.isFinite(w) && w >= 10 && w <= 100 ? w : DEFAULT_ASSET_WIDTH
  const display: AssetDisplay = params.get('d') === 'link' ? 'link' : 'image'
  return { filename, width, display }
}

/** Build an `asset://` src from its parts (omits defaults to keep markdown clean). */
export function buildAssetSrc(filename: string, width: number, display: AssetDisplay): string {
  const params: string[] = []
  if (display === 'link') {
    params.push('d=link')
  } else if (width !== DEFAULT_ASSET_WIDTH) {
    params.push(`w=${Math.round(width)}`)
  }
  const query = params.length ? `?${params.join('&')}` : ''
  return `asset://${filename}${query}`
}

/** Extract every asset filename referenced by a note's markdown body. */
export function parseAssetRefs(markdown: string): string[] {
  const found = new Set<string>()
  const re = /asset:\/\/([^)\s?"'>]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    found.add(decodeURIComponent(m[1]))
  }
  return [...found]
}

// ── Unused-image cleanup ──────────────────────────────────────────────────────
// Image files are never deleted when a note, entry or image is removed: the
// edit might be cancelled or undone, the same image may be referenced from
// another note, and an older backup restored later may still point at it.
// Instead, unreferenced files are found and removed on request (Settings → Data).

/** Files modified more recently than this are skipped — they may belong to an editor that hasn't saved yet. */
const UNUSED_ASSET_MIN_AGE_MS = 24 * 60 * 60 * 1000

export interface UnusedAsset {
  filename: string
  size: number
}

/**
 * List files in the assets folder that no saved record references.
 * References are found by scanning the full backup snapshot, so every table
 * that can hold markdown is covered without listing them here.
 */
export async function findUnusedAssets(): Promise<UnusedAsset[]> {
  const dir = await getAssetsDir(false)
  if (!dir) return []
  // Dynamic import avoids a circular dependency (index.ts → … → assets.ts)
  const { snapshotUserData } = await import('./index')
  const referenced = new Set(parseAssetRefs(JSON.stringify(await snapshotUserData())))
  const cutoff = Date.now() - UNUSED_ASSET_MIN_AGE_MS
  const unused: UnusedAsset[] = []
  for await (const handle of dir.values()) {
    if (handle.kind !== 'file' || referenced.has(handle.name)) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    if (file.lastModified > cutoff) continue
    unused.push({ filename: handle.name, size: file.size })
  }
  return unused.sort((a, b) => a.filename.localeCompare(b.filename))
}
