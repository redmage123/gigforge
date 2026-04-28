import { downloadCsv, rowsToCsv, todayStamp } from '../utils/csv'

interface Props<T> {
  rows: T[]
  filenamePrefix: string
  headers: string[]
  rowMapper: (row: T) => unknown[]
  disabled?: boolean
  label?: string
}

/**
 * Generic CSV download button.
 *
 *   <CsvDownloadButton
 *     rows={transactions}
 *     filenamePrefix="transactions"
 *     headers={['Date', 'Type', 'Asset', 'Amount']}
 *     rowMapper={(t) => [t.date, t.type, t.asset, t.amount]}
 *   />
 */
export default function CsvDownloadButton<T>({
  rows,
  filenamePrefix,
  headers,
  rowMapper,
  disabled,
  label = 'Export CSV',
}: Props<T>) {
  function onClick() {
    const csv = rowsToCsv(headers, rows.map(rowMapper))
    downloadCsv(`${filenamePrefix}-${todayStamp()}.csv`, csv)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || rows.length === 0}
      className="px-3 py-1.5 rounded bg-bg-elevated border border-bg-border text-text-primary text-sm hover:bg-bg-border disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid="csv-download"
    >
      {label}
    </button>
  )
}
