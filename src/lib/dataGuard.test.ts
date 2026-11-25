import { describe, it, expect } from 'vitest'
import { assessDrop, countRecords, type RecordCounts } from './dataGuard'

const counts = (c: Partial<RecordCounts>): RecordCounts =>
  ({ projects: 0, tasks: 0, workLogEntries: 0, notebookPages: 0, contacts: 0, journalEntries: 0, inTrash: 0, ...c })

describe('assessDrop', () => {
  const before = counts({ projects: 40, tasks: 300, workLogEntries: 900, notebookPages: 120, contacts: 60, journalEntries: 80 })

  it('ignores normal editing', () => {
    expect(assessDrop(before, counts({ ...before, tasks: 299 }))).toBeNull()
    expect(assessDrop(before, counts({ ...before, tasks: 320 }))).toBeNull()
  })

  it('ignores a big delete that went to the Trash', () => {
    // A project with 30 tasks and 200 log entries moved to the Trash
    expect(assessDrop(before, counts({ ...before, projects: 39, tasks: 270, workLogEntries: 700, inTrash: 231 }))).toBeNull()
  })

  it('stops for a large unexplained drop', () => {
    const drop = assessDrop(before, counts({ ...before, workLogEntries: 600 }))
    expect(drop?.lost).toBe(300)
    expect(drop?.tables).toEqual([{ key: 'workLogEntries', label: 'Work log entries', before: 900, after: 600 }])
  })

  it('stops when a table is emptied, however small the rest', () => {
    expect(assessDrop(before, counts({ ...before, notebookPages: 0 }))).not.toBeNull()
  })

  it('stops when the Trash is emptied of a lot of records', () => {
    const withTrash = counts({ ...before, inTrash: 400 })
    expect(assessDrop(withTrash, counts({ ...before, inTrash: 0 }))).not.toBeNull()
  })

  it('does not stop for small data sets losing a few records', () => {
    expect(assessDrop(counts({ projects: 3, tasks: 10 }), counts({ projects: 1, tasks: 2 }))).toBeNull()
  })
})

describe('countRecords', () => {
  it('counts rows and what the Trash holds', () => {
    const data = {
      projects: [{}, {}], tasks: [{}],
      trash: [{ payload: JSON.stringify({ row: {}, tasks: [{}, {}], workLogEntries: [{}] }) }, { payload: '{"row":{}}' }],
    }
    expect(countRecords(data)).toMatchObject({ projects: 2, tasks: 1, workLogEntries: 0, inTrash: 5 })
  })
})
