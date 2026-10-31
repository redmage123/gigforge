/**
 * Text alternative for a chart (WCAG 1.1.1): a collapsible table of exactly
 * the values drawn. Pair it with an aria-label summary on the chart itself.
 */
export default function ChartTable({ caption, labels, series, unit = '' }) {
  return (
    <details className="chart-data">
      <summary>Show data as a table</summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>
            <th scope="col">Category</th>
            {series.map(s => <th scope="col" key={s.name}>{s.name}{unit ? ` (${unit})` : ''}</th>)}
          </tr></thead>
          <tbody>{labels.map((l, i) => (
            <tr key={l}><th scope="row">{l}</th>{series.map(s => <td key={s.name}>{s.values[i] ?? '—'}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  )
}

/** Theme-aware colour for chart axis/legend text (chart.js draws on canvas, so CSS can't reach it). */
export function chartTextColor(token = '--text-secondary') {
  if (typeof window === 'undefined') return '#b4c0cf'
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#b4c0cf'
}

/** One-line summary of labelled values, for a chart's aria-label. */
export function summarise(labels, values, unit = '') {
  const parts = labels.map((l, i) => `${l} ${values[i] ?? 0}${unit}`)
  return parts.length ? parts.join(', ') : 'no data'
}
