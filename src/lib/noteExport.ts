import { marked } from 'marked'

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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Pre-process tiptap-specific tokens before markdown parsing
function markdownToHtml(body: string): string {
  const md = body
    .replace(/==(.+?)==/g, '<mark>$1</mark>')     // ==highlight== → <mark>
    .replace(/\[\[([^\]]+)\]\]/g, '<em>$1</em>')  // [[wiki link]] → italic name
  return marked.parse(md, { gfm: true }) as string
}

// Clean up tiptap-markdown over-escaping for .md downloads (not applied to DB content)
function cleanMarkdownExport(body: string): string {
  return body
    .replace(/^\\- /gm, '- ')
    .replace(/^\\\d+\. /gm, m => m.slice(1))
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
}

function notesToHtml(pages: ExportablePage[]): string {
  const sections = pages.map(p =>
    `<h1>${escHtml(p.title || 'Untitled')}</h1><div class="body">${markdownToHtml(p.body)}</div>`
  ).join('<hr>')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notebook Export</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:2em auto;padding:0 2em;line-height:1.6}
  h1{font-size:1.5em;margin-top:0}
  mark{background:#fff3b0;padding:0 2px;border-radius:2px}
  code{background:#f4f4f4;padding:0 3px;border-radius:3px;font-size:.9em}
  pre{background:#f4f4f4;padding:1em;border-radius:6px;overflow-x:auto}
  pre code{background:none;padding:0}
  blockquote{border-left:3px solid #ccc;margin:0;padding-left:1em;color:#666}
  table{border-collapse:collapse}
  td,th{border:1px solid #ccc;padding:.3em .6em}
  hr{break-after:page;margin:2em 0;border:none;border-top:1px solid #eee}
  @media print{@page{margin:2cm}}
</style></head><body>${sections}<script>window.onload=()=>window.print()</script></body></html>`
}

// RTF body content only (no \rtf1 header) — used to build single or multi-page documents
function mdToRtfBody(title: string, body: string): string {
  const escape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')

  let t = escape(body)
  // headings (order matters — most specific first)
  t = t.replace(/^### (.+)$/gm, '{\\pard\\sb160\\sa80\\b\\fs22 $1\\b0\\fs24\\par}')
  t = t.replace(/^## (.+)$/gm,  '{\\pard\\sb200\\sa80\\b\\fs28 $1\\b0\\fs24\\par}')
  t = t.replace(/^# (.+)$/gm,   '{\\pard\\sb240\\sa80\\b\\fs36 $1\\b0\\fs24\\par}')
  // horizontal rule
  t = t.replace(/^---$/gm, '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}')
  // task list items (must precede bullet list)
  t = t.replace(/^- \[x\] (.+)$/gm, '{\\pard\\li360 \\u10003? $1\\par}')
  t = t.replace(/^- \[ \] (.+)$/gm, '{\\pard\\li360 \\u9744? $1\\par}')
  // bullet lists
  t = t.replace(/^[-*+] (.+)$/gm, '{\\pard\\li360 \\bullet  $1\\par}')
  // bold + italic (most specific first)
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '{\\b\\i $1\\i0\\b0}')
  t = t.replace(/\*\*(.+?)\*\*/g, '{\\b $1\\b0}')
  t = t.replace(/\*(.+?)\*/g, '{\\i $1\\i0}')
  // strikethrough
  t = t.replace(/~~(.+?)~~/g, '{\\strike $1\\strike0}')
  // highlight
  t = t.replace(/==(.+?)==/g, '{\\highlight3 $1}')
  // inline code
  t = t.replace(/`(.+?)`/g, '{\\f1 $1}')
  // remaining non-empty lines that don't already start with RTF control
  t = t.replace(/^([^{\\].*)$/gm, '{\\pard $1\\par}')
  // blank lines
  t = t.replace(/^\s*$/gm, '{\\pard\\par}')

  const titleRtf = `{\\pard\\sb0\\sa160\\b\\fs36 ${escape(title || 'Untitled')}\\b0\\fs24\\par}`
  return titleRtf + t
}

function buildRtfDocument(sections: ExportablePage[]): string {
  const body = sections
    .map((s, i) => (i > 0 ? '{\\pard\\page\\par}' : '') + mdToRtfBody(s.title, s.body))
    .join('')
  return (
    '{\\rtf1\\ansi\\deff0' +
    '{\\fonttbl{\\f0\\froman\\fcharset0 Arial;}{\\f1\\fmodern\\fcharset0 Courier New;}}' +
    '{\\f0\\fs24 ' + body + '}'
  )
}

export function exportNote(page: ExportablePage, format: NoteExportFormat) {
  const name = safeFilename(page.title)
  if (format === 'md') {
    downloadBlob(cleanMarkdownExport(page.body), `${name}.md`, 'text/markdown')
  } else if (format === 'rtf') {
    downloadBlob(buildRtfDocument([page]), `${name}.rtf`, 'text/rtf')
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
    const content = pages.map(p => `# ${p.title || 'Untitled'}\n\n${cleanMarkdownExport(p.body)}`).join('\n\n---\n\n')
    downloadBlob(content, 'notebook-export.md', 'text/markdown')
  } else if (format === 'rtf') {
    downloadBlob(buildRtfDocument(pages), 'notebook-export.rtf', 'text/rtf')
  } else {
    const html = notesToHtml(pages)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}
