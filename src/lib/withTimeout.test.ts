import { describe, it, expect, vi } from 'vitest'
import { withTimeout, StepTimeoutError } from './withTimeout'

describe('withTimeout', () => {
  it('passes results and errors through', async () => {
    await expect(withTimeout(Promise.resolve(3), 100, 'x')).resolves.toBe(3)
    await expect(withTimeout(Promise.reject(new Error('boom')), 100, 'x')).rejects.toThrow('boom')
  })

  it('rejects with the step label when the promise never settles', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => {}), 5000, 'Reading the data file')
    vi.advanceTimersByTime(5000)
    await expect(p).rejects.toBeInstanceOf(StepTimeoutError)
    await expect(p).rejects.toMatchObject({ step: 'Reading the data file', name: 'TimeoutError' })
    vi.useRealTimers()
  })
})
