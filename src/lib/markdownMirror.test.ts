import { describe, it, expect } from 'vitest'
import { buildMarkdownMirror, mirrorFileName } from './markdownMirror'

const opts = { assetsFolder: 'MyWorkerAssets', today: '2026-11-25' }

const data = {
  dropdownOptions: [
    { id: 1, type: 'priority', label: 'High' },
    { id: 2, type: 'product_area', label: 'Vendors' },
    { id: 3, type: 'project_status', label: 'In progress' },
  ],
  projects: [
    {
      id: 10, work_item: 'Vendor Risk Review', work_desc: 'See [[Jane Smith]] \\[draft\\]', rag_status: 'Amber',
      priority_id: 1, product_area_id: 2, status_id: 3, latest_status: 'Waiting on legal',
      stakeholders: '[{"name":"Jane Smith"}]', tags: '["vendor","risk review"]', due_date: '2026-12-01',
      is_archived: 0, created_at: '2026-11-01 09:00:00', updated_at: '2026-11-24 10:00:00',
    },
    { id: 11, work_item: 'Q3: Audit', work_desc: '', rag_status: 'Green', is_archived: 1, archived_at: '2026-10-01 12:00:00', stakeholders: '', tags: '' },
  ],
  tasks: [
    { id: 1, project_id: 10, title: 'Send questionnaire', status: 'open', due_date: '2026-11-28', is_recurring: 1, tags: '', description: '', notes: 'line one\nline two' },
    { id: 2, project_id: 10, title: 'Kick-off', status: 'done', completed_at: '2026-11-20 15:00:00', tags: '', description: '', notes: '' },
    { id: 3, project_id: null, product_area_id: 2, title: 'Renew contract', status: 'in_progress', tags: '', description: '', notes: '' },
    { id: 4, project_id: null, product_area_id: null, title: 'Call bank', status: 'open', tags: '', description: '', notes: '' },
  ],
  workLogEntries: [
    { id: 1, project_id: 10, note: 'Older note', created_at: '2026-11-02 09:00:00' },
    { id: 2, project_id: 10, note: 'Pic ![shot](asset://img-1.png?w=50)', created_at: '2026-11-24 09:00:00' },
  ],
  contacts: [{ id: 1, name: 'Jane Smith', role: 'Counsel', group_name: 'Legal', notes: 'Prefers email', whos_who: '', tags: 'legal, vendor' }],
  notebookPages: [
    { id: 1, title: 'Weekly Prep', body: '- \\[ \\] item', starred: 1, is_home: 0 },
    { id: 2, title: 'Weekly Prep', body: 'Second page with the same title', starred: 0, is_home: 0 },
  ],
  journalEntries: [
    { id: 1, entry_date: '2026-11-25', body: '[[Weekly Prep]] at 10' },
    { id: 2, entry_date: '2026-11-24', body: '   ' },
  ],
  trash: [{ id: 1, kind: 'note', payload: '{}' }],
}

describe('markdown mirror', () => {
  const files = buildMarkdownMirror(data, opts)

  it('lays out one file per record', () => {
    expect([...files.keys()].sort()).toEqual([
      'Areas/Vendors.md',
      'Contacts/Jane Smith.md',
      'Inbox.md',
      'Journal/2026-11-25.md',
      'Notes/Weekly Prep (2).md',
      'Notes/Weekly Prep.md',
      'Projects/Archived/Q3- Audit.md',
      'Projects/Vendor Risk Review.md',
      'README.md',
    ])
  })

  it('writes project fields, tasks and the work log newest first', () => {
    const p = files.get('Projects/Vendor Risk Review.md')!
    expect(p).toMatch(/^---\ntype: "project"\nrag: "Amber"\npriority: "High"\narea: "Vendors"\nstatus: "In progress"/)
    expect(p).toContain('stakeholders: ["Jane Smith"]')
    expect(p).toContain('tags: ["vendor", "risk-review"]')
    expect(p).toContain('See [[Jane Smith]] [draft]')
    expect(p).toContain('- [ ] Send questionnaire 🔁 recurring 📅 2026-11-28\n    line one\n    line two')
    expect(p).toMatch(/- \[x\] Kick-off ✅ 2026-11-2\d/)
    expect(p.indexOf('Pic ')).toBeLessThan(p.indexOf('Older note'))
  })

  it('points images at the assets folder', () => {
    expect(files.get('Projects/Vendor Risk Review.md')).toContain('![shot](../../MyWorkerAssets/img-1.png)')
  })

  it('keeps the real name as an alias when the file name differs', () => {
    expect(files.get('Projects/Archived/Q3- Audit.md')).toContain('aliases: ["Q3: Audit"]')
    expect(files.get('Projects/Vendor Risk Review.md')).not.toContain('aliases')
  })

  it('puts project-less tasks under their area or the Inbox', () => {
    expect(files.get('Areas/Vendors.md')).toContain('- [[Vendor Risk Review]]')
    expect(files.get('Areas/Vendors.md')).toContain('- [/] Renew contract')
    expect(files.get('Inbox.md')).toContain('- [ ] Call bank')
  })

  it('writes contacts with the projects they are a stakeholder on', () => {
    const c = files.get('Contacts/Jane Smith.md')!
    expect(c).toContain('role: "Counsel"')
    expect(c).toContain('tags: ["legal", "vendor"]')
    expect(c).toContain('## Stakeholder on\n\n- [[Vendor Risk Review]]')
  })

  it('undoes editor escaping and skips empty journal days', () => {
    expect(files.get('Notes/Weekly Prep.md')).toContain('- [ ] item')
    expect(files.get('Notes/Weekly Prep.md')).toContain('starred: true')
    expect(files.has('Journal/2026-11-24.md')).toBe(false)
  })
})

describe('mirror file names', () => {
  it('removes characters files and links cannot hold', () => {
    expect(mirrorFileName('A/B: C?')).toBe('A-B- C-')
    expect(mirrorFileName('[[x]] #tag | y')).toBe('--x-- -tag - y')
    expect(mirrorFileName('.hidden...')).toBe('hidden')
    expect(mirrorFileName('   ')).toBe('Untitled')
  })
})
