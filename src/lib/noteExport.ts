export type NoteExportFormat = 'md' | 'rtf' | 'pdf'

export interface ExportablePage {
  title: string
  body: string
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilename(title: string): string {
  return (title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Untitled'
}

// Minimal markdown → RTF conversion (bold, italic, headings, bullets, paragraphs)
function mdToRtf(title: string, body: string): string {
  const escape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')

  let t = escape(body)
  // headings
  t = t.replace(/^### (.+)$/gm, '{\\pard\\sb160\\sa80\\b\\fs22 $1\\b0\\fs24\\par}')
  t = t.replace(/^## (.+)$/gm,  '{\\pard\\sb200\\sa80\\b\\fs28 $1\\b0\\fs24\\par}')
  t = t.replace(/^# (.+)$/gm,   '{\\pard\\sb240\\sa80\\b\\fs36 $1\\b0\\fs24\\par}')
  // horizontal rule
  t = t.replace(/^---$/gm, '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}')
  // bullet lists
  t = t.replace(/^[-*+] (.+)$/gm, '{\\pard\\li360 \\bullet  $1\\par}')
  // bold + italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '{\\b\\i $1\\i0\\b0}')
  t = t.replace(/\*\*(.+?)\*\*/g, '{\\b $1\\b0}')
  t = t.replace(/\*(.+?)\*/g, '{\\i $1\\i0}')
  // inline code
  t = t.replace(/`(.+?)`/g, '{\\f1 $1}')
  // remaining non-empty lines as paragraphs
  t = t.replace(/^([^{\\].*)$/gm, '{\\pard $1\\par}')
  // blank lines
  t = t.replace(/^\s*$/gm, '{\\pard\\par}')

  return (
    '{\\rtf1\\ansi\\deff0' +
    '{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}' +
    '{\\f0\\fs24 ' +
    `{\\pard\\sb0\\sa160\\b\\fs36 ${escape(title || 'Untitled')}\\b0\\fs24\\par}` +
    t +
    '}'
  )
}

function notesToHtml(pages: ExportablePage[]): string {
  const sections = pages
    .map(p => {
      const body = (p.body || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<h1>${(p.title || 'Untitled').replace(/&/g, '&amp;')}</h1><pre style="white-space:pre-wrap;font-family:inherit">${body}</pre>`
    })
    .join('<hr style="margin:2em 0">')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notebook Export</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:2em auto;padding:0 2em;line-height:1.6}
  h1{font-size:1.5em;margin-top:0}
  @media print{@page{margin:2cm}hr{break-after:page}}
</style></head><body>${sections}<script>window.onload=()=>window.print()</script></body></html>`
}

export function exportNote(page: ExportablePage, format: NoteExportFormat) {
  const name = safeFilename(page.title)
  if (format === 'md') {
    downloadBlob(page.body, `${name}.md`, 'text/markdown')
  } else if (format === 'rtf') {
    downloadBlob(mdToRtf(page.title, page.body), `${name}.rtf`, 'application/rtf')
  } else {
    const html = notesToHtml([page])
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}

export function exportAllNotes(pages: ExportablePage[], format: NoteExportFormat) {
  if (format === 'md') {
    const content = pages.map(p => `# ${p.title || 'Untitled'}\n\n${p.body}`).join('\n\n---\n\n')
    downloadBlob(content, 'notebook-export.md', 'text/markdown')
  } else if (format === 'rtf') {
    const body = pages
      .map(p => mdToRtf(p.title, p.body))
      .join('{\\pard\\page\\par}\n')
    downloadBlob(body, 'notebook-export.rtf', 'application/rtf')
  } else {
    const html = notesToHtml(pages)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}
