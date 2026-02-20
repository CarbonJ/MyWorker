/**
 * useDataLoader — generic async data-loading hook.
 *
 * Eliminates the repeated pattern of:
 *   const load = useCallback(async () => { try { … } catch { handleError } }, [deps])
 *   useEffect(() => { load() }, [load])
 *
 * Usage:
 *   const { data, reload, loading } = useDataLoader(
 *     async () => {
 *       const [projects, priorities] = await Promise.all([getAllProjects(), getDropdownOptions('priority')])
 *       return { projects, priorities }
 *     },
 *     'Failed to load projects',
 *   )
 *
 * - `data` starts as `null` and updates to the resolved value after the first load.
 * - `reload` triggers a fresh load on demand (e.g. after a mutation).
 * - `loading` is true on the first load only (not on subsequent reloads).
 * - Errors are toasted via useErrorHandler and logged to the console.
 * - The loader function is stable-referenced via useRef, so it does not need
 *   to be memoised by the caller — just pass an inline async arrow function.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useErrorHandler } from './useErrorHandler'

export function useDataLoader<T>(
  loader: () => Promise<T>,
  errorContext: string,
): { data: T | null; reload: () => Promise<void>; loading: boolean } {
  const { handleError } = useErrorHandler()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)

  // Keep the latest loader in a ref so the reload callback never goes stale,
  // even if the caller passes a new inline function on each render.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const errorContextRef = useRef(errorContext)
  errorContextRef.current = errorContext

  const reload = useCallback(async () => {
    try {
      const result = await loaderRef.current()
      setData(result)
    } catch (err) {
      handleError(err, errorContextRef.current)
    } finally {
      setLoading(false)
    }
  }, [handleError])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, reload, loading }
}
