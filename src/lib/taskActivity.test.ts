import { describe, it, expect } from 'vitest'
import { combineStartedCompleted } from './taskActivity'

let nextId = 1
const line = (note: string, createdAt: string, projectId = 1, isSystem = true) =>
  ({ id: nextId++, projectId, note, createdAt, isSystem })

describe('combineStartedCompleted', () => {
  it('folds a started line into the later completed line', () => {
    const start = line('▶ Started: Write memo', '2026-11-18 09:00:00')
    const done = line('✓ Completed: Write memo', '2026-11-18 11:30:00')
    // newest first, as the digest query returns them
    const out = combineStartedCompleted([done, start])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: done.id, note: '✓ Started & completed: Write memo', startedAt: start.createdAt })
  })

  it('keeps the next-due detail of recurring tasks', () => {
    const out = combineStartedCompleted([
      line('▶ Started: Weekly check', '2026-11-18 09:00:00'),
      line('✓ Completed: Weekly check. Next due: 25 Nov', '2026-11-18 10:00:00'),
    ])
    expect(out.map(e => e.note)).toEqual(['✓ Started & completed: Weekly check. Next due: 25 Nov'])
  })

  it('leaves lines alone when only one of the pair is present', () => {
    const lines = [line('▶ Started: A', '2026-11-18 09:00:00'), line('✓ Completed: B', '2026-11-18 10:00:00')]
    expect(combineStartedCompleted(lines)).toEqual(lines)
  })

  it('does not pair across projects, user notes or a reopen', () => {
    const otherProject = [line('▶ Started: A', '2026-11-18 09:00:00', 1), line('✓ Completed: A', '2026-11-18 10:00:00', 2)]
    expect(combineStartedCompleted(otherProject)).toHaveLength(2)
    const userNote = [line('▶ Started: A', '2026-11-18 09:00:00', 1, false), line('✓ Completed: A', '2026-11-18 10:00:00')]
    expect(combineStartedCompleted(userNote)).toHaveLength(2)
    const reopened = [
      line('▶ Started: A', '2026-11-18 09:00:00'),
      line('↩ Reopened: A', '2026-11-18 09:30:00'),
      line('✓ Completed: A', '2026-11-18 10:00:00'),
    ]
    expect(combineStartedCompleted(reopened)).toHaveLength(3)
  })

  it('does not treat a completed-before-started order as a pair', () => {
    const lines = [line('✓ Completed: A', '2026-11-18 09:00:00'), line('▶ Started: A', '2026-11-18 10:00:00')]
    expect(combineStartedCompleted(lines)).toHaveLength(2)
  })
})
