// Type stubs for wa-sqlite — the package ships no .d.ts files

interface EmscriptenOptions {
  locateFile?: (file: string, prefix: string) => string
  wasmBinary?: ArrayBuffer
  [key: string]: unknown
}

declare module 'wa-sqlite/dist/wa-sqlite.mjs' {
  const SQLiteESMFactory: (opts?: EmscriptenOptions) => Promise<object>
  export default SQLiteESMFactory
}

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  const SQLiteAsyncESMFactory: (opts?: EmscriptenOptions) => Promise<object>
  export default SQLiteAsyncESMFactory
}

declare module 'wa-sqlite/src/sqlite-api.js' {
  export const SQLITE_ROW: number
  export const SQLITE_DONE: number
  export const SQLITE_OK: number
  export const SQLITE_OPEN_READWRITE: number
  export const SQLITE_OPEN_CREATE: number

  export interface SQLiteAPI {
    open_v2(filename: string, flags?: number, vfs?: string): Promise<number>
    close(db: number): Promise<void>
    exec(db: number, sql: string): Promise<void>
    statements(db: number, sql: string): AsyncIterable<number>
    bind(stmt: number, i: number, value: number | string | Uint8Array | null): void
    step(stmt: number): Promise<number>
    column(stmt: number, i: number): number | string | Uint8Array | null
    column_names(stmt: number): string[]
    last_insert_rowid(db: number): number
    finalize(stmt: number): Promise<void>
    vfs_register(vfs: object, makeDefault?: boolean): number
  }

  export function Factory(module: object): SQLiteAPI
}

declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS {
    constructor(directoryPath: string)
    isReady: Promise<void>
    name: string
    close(): Promise<void>
  }
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(idbName: string, options?: object)
    // Note: no `isReady` — that only exists on AccessHandlePoolVFS
    name: string
    close(): Promise<void>
  }
}
