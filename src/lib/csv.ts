/**
 * CSV field escaping (RFC 4180 quoting + spreadsheet formula-injection guard).
 */
export function escapeCsv(v: string): string {
  let s = String(v)
  // Neutralise spreadsheet formula injection: Excel treats cells starting with
  // = + - @ (or tab/CR) as formulas even inside quotes. Prefix with a quote so
  // the cell is always read as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
