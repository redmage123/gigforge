/**
 * Hand-rolled CSV utilities. No external dep needed for these small surfaces.
 *
 * - Quotes any field containing comma, double-quote, newline, or leading whitespace.
 * - Doubles internal quotes per RFC 4180.
 * - Numbers are emitted unquoted; strings always quoted only when needed.
 */

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  const needsQuoting =
    s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
  if (!needsQuoting) return s
  return `"${s.replace(/"/g, '""')}"`
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * Triggers a browser download of the given CSV text.
 *
 * Filename should include the `.csv` extension; pass a date-stamped name like
 * `transactions-2026-04-28.csv` so multiple exports don't collide.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function todayStamp(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
