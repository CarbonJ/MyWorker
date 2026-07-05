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

export function setAssetsFolderName(name: string): void {
  const clean = name.trim() || DEFAULT_ASSETS_FOLDER
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

/** Read an image file from the assets folder as a Blob, or null if missing. */
export async function readAssetBlob(filename: string): Promise<Blob | null> {
  const dir = await getAssetsDir(false)
  if (!dir) return null
  try {
    const fileHandle = await dir.getFileHandle(filename, { create: false })
    return await fileHandle.getFile()
  } catch {
    return null
  }
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

/** Delete every asset file referenced by a note's markdown body (best-effort). */
export async function deleteNoteAssets(markdown: string): Promise<void> {
  for (const filename of parseAssetRefs(markdown)) {
    await deleteAssetImage(filename)
  }
}
