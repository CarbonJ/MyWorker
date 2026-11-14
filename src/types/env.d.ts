/** Injected by Vite at build time from package.json */
declare const __APP_VERSION__: string

/** Async iteration over a directory's entries — supported in Chrome/Edge, missing from TS's DOM lib */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
}
