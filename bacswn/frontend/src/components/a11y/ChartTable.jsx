/**
 * Chart accessibility helpers.
 *
 * What: ChartTable (a collapsible data table for a chart), chartTextColor
 * (theme-aware text colour for canvas charts) and summarise (a one-line value
 * summary for a chart's aria-label).
 *
 * Why: chart.js draws on a canvas that screen readers cannot read and CSS cannot
 * style; these give every chart a text equivalent (WCAG 1.1.1) and readable axis
 * text in both themes (WCAG 1.4.3).
 *
 * How: the table and the optional CSV/link toolbar are built from the same
 * labels and series the chart is drawn from, so they never disagree.
 */
import ChartActions from '../share/ChartActions'

/**
 * Text alternative for a chart (WCAG 1.1.1): a collapsible table of exactly
 * the values drawn. Pair it with an aria-label summary on the chart itself.
 * Give it the chart card's `shareId` to add the CSV download / copy-link
 * toolbar for the same values.
 * @param {{caption: string, labels: string[], series: {name: string, values: any[]}[], unit?: string,
 *   shareId?: string, filename?: string, labelHeader?: string}} props
 */
export default function ChartTable({ caption, labels, series, unit = '', shareId, filename, labelHeader = 'Category' }) {
  const columns = [labelHeader, ...series.map(s => `${s.name}${unit ? ` (${unit})` : ''}`)]
  const rows = labels.map((l, i) => [l, ...series.map(s => s.values[i] ?? '')])
  return (
    <>
    {shareId && <ChartActions id={shareId} title={caption} filename={filename || shareId} columns={columns} rows={rows} />}
    <details className="chart-data">
      <summary>Show data as a table</summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>
            <th scope="col">{labelHeader}</th>
            {series.map(s => <th scope="col" key={s.name}>{s.name}{unit ? ` (${unit})` : ''}</th>)}
          </tr></thead>
          <tbody>{labels.map((l, i) => (
            <tr key={l}><th scope="row">{l}</th>{series.map(s => <td key={s.name}>{s.values[i] ?? '—'}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </details>
    </>
  )
}

/**
 * Theme-aware colour for chart axis/legend text (chart.js draws on canvas, so CSS can't reach it).
 * @param {string} [token] CSS custom property to read
 * @returns {string} the colour, or a fixed fallback outside the browser
 */
export function chartTextColor(token = '--text-secondary') {
  if (typeof window === 'undefined') return '#b4c0cf'
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#b4c0cf'
}

/**
 * One-line summary of labelled values, for a chart's aria-label.
 * @param {string[]} labels
 * @param {number[]} values missing values read as 0
 * @param {string} [unit] appended to each value, e.g. ' kg'
 * @returns {string} e.g. "Mon 3 kg, Tue 5 kg", or 'no data'
 */
export function summarise(labels, values, unit = '') {
  const parts = labels.map((l, i) => `${l} ${values[i] ?? 0}${unit}`)
  return parts.length ? parts.join(', ') : 'no data'
}
