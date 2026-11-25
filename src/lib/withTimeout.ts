/**
 * Time limits for browser storage calls (IndexedDB, File System Access) that
 * can hang without ever settling — e.g. reading a file OneDrive has left
 * stranded after a client problem. A hang becomes a labelled error the app
 * can show and recover from, instead of an endless spinner.
 */

export const DEFAULT_TIMEOUT_MS = 5000

export class StepTimeoutError extends Error {
  readonly step: string
  constructor(step: string, ms: number) {
    super(`${step} did not finish within ${Math.round(ms / 1000)} seconds`)
    this.name = 'TimeoutError'
    this.step = step
  }
}

/** Resolve or reject as `promise` does, or reject with StepTimeoutError after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number = DEFAULT_TIMEOUT_MS, label = 'Operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(label, ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
