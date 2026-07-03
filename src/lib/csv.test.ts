import { describe, it, expect } from 'vitest'
import { escapeCsv } from './csv'

describe('escapeCsv', () => {
  it('wraps values in quotes', () => {
    expect(escapeCsv('hello')).toBe('"hello"')
  })

  it('doubles embedded quotes', () => {
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""')
  })

  it('neutralises formula-injection prefixes', () => {
    expect(escapeCsv('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"')
    expect(escapeCsv('+1+2')).toBe('"\'+1+2"')
    expect(escapeCsv('-2+3')).toBe('"\'-2+3"')
    expect(escapeCsv('@SUM(A1)')).toBe('"\'@SUM(A1)"')
  })

  it('leaves ordinary values unprefixed', () => {
    expect(escapeCsv('Project Alpha')).toBe('"Project Alpha"')
    expect(escapeCsv('07/02/26')).toBe('"07/02/26"')
  })
})
