import { describe, it, expect } from 'vitest'
import { parseAssetSrc, buildAssetSrc } from './assets'

describe('asset src width', () => {
  it('reads percent, pixel and default widths', () => {
    expect(parseAssetSrc('asset://a.png')).toEqual({ filename: 'a.png', width: 25, unit: '%', display: 'image' })
    expect(parseAssetSrc('asset://a.png?w=60')).toMatchObject({ width: 60, unit: '%' })
    expect(parseAssetSrc('asset://a.png?px=480')).toMatchObject({ width: 480, unit: 'px' })
    expect(parseAssetSrc('asset://a.png?w=900')).toMatchObject({ width: 100, unit: '%' })
  })

  it('round-trips every combination', () => {
    for (const src of ['asset://a.png', 'asset://a.png?w=60', 'asset://a.png?px=480', 'asset://a.png?px=480&d=link', 'asset://a.png?w=40&d=link']) {
      const p = parseAssetSrc(src)!
      expect(buildAssetSrc(p.filename, p.width, p.display, p.unit)).toBe(src)
    }
  })

  it('keeps the size when shown as a link', () => {
    expect(buildAssetSrc('a.png', 300, 'link', 'px')).toBe('asset://a.png?px=300&d=link')
  })
})
