import { describe, it, expect } from 'vitest'
import { crc32, buildZip, cleanMarkdownExport, safeFilename } from './noteExport'

const enc = new TextEncoder()

describe('crc32', () => {
  it('matches the standard check value', () => {
    // CRC-32 check value for ASCII "123456789" (see e.g. RFC 3720 appendix)
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
  })

  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('buildZip', () => {
  const u16At = (b: Uint8Array, off: number) => b[off] | (b[off + 1] << 8)
  const u32At = (b: Uint8Array, off: number) =>
    (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0

  it('produces a structurally valid store-only archive', () => {
    const zip = buildZip([
      { name: 'a.md', data: enc.encode('alpha') },
      { name: 'b.md', data: enc.encode('bravo') },
    ])

    // Local file header signature at the start
    expect(u32At(zip, 0)).toBe(0x04034b50)

    // End-of-central-directory record: last 22 bytes (no archive comment)
    const eocd = zip.length - 22
    expect(u32At(zip, eocd)).toBe(0x06054b50)
    // Total entry count
    expect(u16At(zip, eocd + 10)).toBe(2)

    // CRC in the first local header matches the entry data
    expect(u32At(zip, 14)).toBe(crc32(enc.encode('alpha')))

    // File names and contents are present in the raw bytes
    const text = new TextDecoder('latin1').decode(zip)
    expect(text).toContain('a.md')
    expect(text).toContain('b.md')
    expect(text).toContain('alpha')
    expect(text).toContain('bravo')
  })

  it('handles an empty archive', () => {
    const zip = buildZip([])
    expect(zip.length).toBe(22) // just the EOCD record
    expect(u32At(zip, 0)).toBe(0x06054b50)
  })
})

describe('cleanMarkdownExport', () => {
  it('unescapes tiptap-markdown over-escaping', () => {
    expect(cleanMarkdownExport('\\- item')).toBe('- item')
    expect(cleanMarkdownExport('\\1. item')).toBe('1. item')
    expect(cleanMarkdownExport('\\[\\[Wiki\\]\\]')).toBe('[[Wiki]]')
  })

  it('leaves normal markdown untouched', () => {
    const md = '# Title\n\n- item\n\n[link](http://x)'
    expect(cleanMarkdownExport(md)).toBe(md)
  })
})

describe('safeFilename', () => {
  it('replaces filesystem-hostile characters', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('falls back to Untitled', () => {
    expect(safeFilename('')).toBe('Untitled')
    expect(safeFilename('///')).toBe('---') // slashes replaced, still non-empty
  })
})
