import { describe, it, expect } from 'vitest'
import { validateBackupData } from './backupValidation'

const project = {
  id: 1, work_item: 'Alpha', work_desc: '', rag_status: 'Green',
  priority_id: null, latest_status: '', product_area_id: null, status_id: null,
  due_date: null, is_archived: 0, stakeholders: '', linked_jiras: '', tags: '',
  created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
}

function validV2() {
  return {
    version: 2,
    projects: [{ ...project }],
    workLogEntries: [{ id: 1, project_id: 1, note: 'did a thing', is_system: 0, created_at: '2026-01-02 10:00:00' }],
    tasks: [{ id: 1, project_id: 1, title: 'Task', description: '', notes: '', status: 'open', owner: '', start_date: null, due_date: '2026-02-01', created_at: 'x', updated_at: 'x' }],
    dropdownOptions: [{ id: 1, type: 'priority', label: 'High', sort_order: 0, color: '' }],
    contacts: [{ id: 1, name: 'Ada' }],
    notebookPages: [{ id: 1, title: 'Note', body: 'text' }],
    savedViews: [{ id: 1, page: 'prime', name: 'My view', data: '{}' }],
    localPrefs: { 'myworker:theme': 'dark' },
  }
}

describe('validateBackupData', () => {
  it('accepts a complete v2 backup', () => {
    expect(() => validateBackupData(validV2())).not.toThrow()
  })

  it('accepts a minimal v1 backup (optional tables absent)', () => {
    expect(() => validateBackupData({ version: 1, projects: [] })).not.toThrow()
  })

  it('rejects missing top-level fields', () => {
    expect(() => validateBackupData({})).toThrow(/missing or wrong-typed/)
    expect(() => validateBackupData({ version: 2 })).toThrow(/missing or wrong-typed/)
  })

  it('rejects versions newer than the app supports', () => {
    expect(() => validateBackupData({ version: 3, projects: [] })).toThrow(/newer than this app supports/)
  })

  it('rejects wrong-typed optional sections', () => {
    expect(() => validateBackupData({ version: 2, projects: [], tasks: 'nope' })).toThrow(/"tasks" must be an array/)
    expect(() => validateBackupData({ version: 2, projects: [], localPrefs: ['a'] })).toThrow(/"localPrefs" must be an object/)
  })

  it('rejects invalid RAG status', () => {
    const data = validV2()
    data.projects[0].rag_status = 'Purple'
    expect(() => validateBackupData(data)).toThrow(/invalid rag_status/)
  })

  it('rejects work log entries referencing unknown projects', () => {
    const data = validV2()
    data.workLogEntries[0].project_id = 99
    expect(() => validateBackupData(data)).toThrow(/does not match any project/)
  })

  it('rejects tasks with invalid status or malformed dates', () => {
    const bad1 = validV2()
    bad1.tasks[0].status = 'paused'
    expect(() => validateBackupData(bad1)).toThrow(/invalid status/)

    const bad2 = validV2()
    bad2.tasks[0].due_date = '02/01/2026'
    expect(() => validateBackupData(bad2)).toThrow(/YYYY-MM-DD/)
  })

  it('rejects invalid dropdown types and empty labels', () => {
    const bad = validV2()
    bad.dropdownOptions[0].type = 'flavour'
    expect(() => validateBackupData(bad)).toThrow(/invalid type/)
  })

  it('rejects contacts without a name', () => {
    const bad = validV2()
    bad.contacts[0].name = '  '
    expect(() => validateBackupData(bad)).toThrow(/name must be a non-empty string/)
  })

  it('rejects saved views without page or name', () => {
    const bad = validV2()
    bad.savedViews[0].page = ''
    expect(() => validateBackupData(bad)).toThrow(/page must be a non-empty string/)
  })
})
