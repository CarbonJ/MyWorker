/**
 * useErrorHandler — centralised error handling for database operations.
 *
 * Returns a single `handleError` function. Components call it inside catch
 * blocks instead of duplicating the same toast + console.error logic ~50 times.
 *
 * Changing how errors are displayed or logged only requires editing this file.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'

export function useErrorHandler() {
  const handleError = useCallback((err: unknown, context: string) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${context}]`, err)
    toast.error(`${context}: ${message}`)
  }, [])

  return { handleError }
}
