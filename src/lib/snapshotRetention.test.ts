import { describe, it, expect } from 'vitest'
import { snapshotsToPrune } from './snapshotRetention'

describe('snapshotsToPrune', () => {
  it('keeps the last 30 days', () => {
    expect(snapshotsToPrune(['2026-11-24', '2026-11-01', '2026-10-26'], '2026-11-24')).toEqual([])
  })

  it('keeps the first snapshot of each older month and prunes the rest', () => {
    const dates = ['2026-09-03', '2026-09-04', '2026-09-30', '2026-08-15', '2026-08-20']
    expect(snapshotsToPrune(dates, '2026-11-24').sort()).toEqual(['2026-08-20', '2026-09-04', '2026-09-30'])
  })

  it('drops monthly copies older than 12 months', () => {
    expect(snapshotsToPrune(['2025-10-02', '2025-11-05', '2025-12-01'], '2026-11-24')).toEqual(['2025-10-02', '2025-11-05'])
  })
})
