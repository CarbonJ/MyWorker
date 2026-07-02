import { marked } from 'marked'

export type NoteExportFormat = 'md' | 'pdf'

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
  const sections = pages.map(p => {
    // Strip the leading heading if it duplicates the note title (case-insensitive)
    // to avoid printing "Title\n# Title" at the top of the page.
    const titleNorm = (p.title || '').trim().toLowerCase()
    const bodyWithoutDupe = p.body.replace(
      /^#{1,3}\s+(.+?)(\r?\n|$)/,
      (match, text) => text.trim().toLowerCase() === titleNorm ? '' : match
    ).trimStart()

    return `<div class="note-title">${escHtml(p.title || 'Untitled')}</div>`
      + `<div class="body">${markdownToHtml(bodyWithoutDupe)}</div>`
  }).join('<hr>')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notebook Export</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:2em auto;padding:0 2em;line-height:1.6}
  .note-title{font-size:0.75em;color:#999;margin-bottom:0.75em;letter-spacing:0.02em}
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

// Open an HTML string in a new window via document.write so the window URL
// stays as about:blank — prevents the blob URL from appearing in the browser's
// print footer.
function openHtmlForPrint(html: string) {
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

export function exportNote(page: ExportablePage, format: NoteExportFormat) {
  const name = safeFilename(page.title)
  if (format === 'md') {
    downloadBlob(cleanMarkdownExport(page.body), `${name}.md`, 'text/markdown')
  } else {
    openHtmlForPrint(notesToHtml([page]))
  }
}

// ── Minimal store-only (uncompressed) ZIP writer ───────────────────────────
// No dependency: builds a valid .zip with one entry per file using the STORE
// method (compression method 0). Sufficient for text notes; keeps the app lean.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ZipEntry { name: string; data: Uint8Array }

/** Build a store-only ZIP archive from a list of named byte blobs. */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      nameBytes, entry.data,
    ])
    chunks.push(local)

    // Central directory record (points back at the local header offset)
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]))
    offset += local.length
  }

  const centralBlob = concat(central)
  const end = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralBlob.length), u32(offset), u16(0),
  ])
  return concat([...chunks, centralBlob, end])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) { out.set(p, pos); pos += p.length }
  return out
}

/** Export every note as an individual .md file inside a single .zip download. */
export function exportAllNotesZip(pages: ExportablePage[]) {
  const enc = new TextEncoder()
  const usedNames = new Set<string>()
  const entries: ZipEntry[] = pages.map(p => {
    const base = safeFilename(p.title)
    let name = `${base}.md`
    let i = 2
    while (usedNames.has(name.toLowerCase())) { name = `${base} (${i++}).md` }
    usedNames.add(name.toLowerCase())
    return { name, data: enc.encode(cleanMarkdownExport(p.body)) }
  })

  const zip = buildZip(entries)
  const blob = new Blob([zip as unknown as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'notebook-export.zip'
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAllNotes(pages: ExportablePage[], format: NoteExportFormat) {
  if (format === 'md') {
    const content = pages.map(p => `# ${p.title || 'Untitled'}\n\n${cleanMarkdownExport(p.body)}`).join('\n\n---\n\n')
    downloadBlob(content, 'notebook-export.md', 'text/markdown')
  } else {
    openHtmlForPrint(notesToHtml(pages))
  }
}
