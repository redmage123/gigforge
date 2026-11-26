/**
 * Share and export for charts.
 *
 * What: ChartActions (a "Data (CSV)" / "Copy link" toolbar for one chart), plus
 * the helpers toCsv and linkTo.
 *
 * Why: users need the exact numbers behind a chart and a way to send a
 * colleague straight to it; the CSV also serves users who cannot see the chart.
 *
 * How: CSV is built in the browser from the values drawn (or by a server export
 * via `onDownload`); links are the current URL (whose query holds the view's
 * filters, see useUrlState) plus `#<chart id>`, and opening one scrolls to and
 * briefly highlights the chart.
 */
import { useEffect, useRef, useState } from 'react'
import { saveBlob } from '../../api/client'

/**
 * CSV text for a header row plus data rows; neutralises spreadsheet formula injection
 * (cells starting with = + - @ are prefixed with ' unless they are plain numbers).
 * @param {string[]} columns
 * @param {any[][]} rows
 * @returns {string} CRLF-terminated CSV
 */
export function toCsv(columns, rows) {
  /** One CSV cell: formula-neutralised, quoted when it contains a comma, quote or newline. */
  const cell = (v) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/**
 * A link to the current view (its URL state) that scrolls to element `id`.
 * @param {string} id
 * @returns {string} absolute URL
 */
export function linkTo(id) {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#${id}`
}

/**
 * Save / share / export toolbar for one chart.
 *
 * - "Download data (CSV)": the exact values drawn, built in the browser
 *   (or `onDownload` for a server-side export).
 * - "Copy link": a link to this page in its current state (filters live in the
 *   URL), jumping to this chart. Falls back to a selectable field when the
 *   clipboard is unavailable.
 * Opening such a link scrolls to the chart and highlights it briefly.
 * @param {{id: string, title: string, filename?: string, columns?: string[], rows?: any[][],
 *   onDownload?: () => Promise<void>}} props `id`: the chart card's element id
 */
export default function ChartActions({ id, title, filename, columns, rows, onDownload }) {
  const [msg, setMsg] = useState('')
  const [manual, setManual] = useState('')
  const timer = useRef(null)
  const jumped = useRef(false)

  // Arriving via a shared link: bring this chart into view once its data is there.
  const hasData = !!(rows && rows.length) || !!onDownload
  useEffect(() => {
    if (jumped.current || !hasData || window.location.hash !== `#${id}`) return
    jumped.current = true
    const el = document.getElementById(id)
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.classList.add('chart-linked')
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
      setTimeout(() => el.classList.remove('chart-linked'), 2500)
    })
  }, [id, hasData])
  useEffect(() => () => clearTimeout(timer.current), [])

  /** Show a status message (announced politely) for four seconds. */
  const say = (text) => {
    setMsg(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 4000)
  }
  /** Download the data as CSV (or via `onDownload`) and report the outcome. */
  const download = async () => {
    try {
      if (onDownload) await onDownload()
      else saveBlob(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
      say('Data downloaded as CSV')
    } catch (e) { say(e.message || 'Download failed') }
  }
  /** Copy the chart link; without clipboard access, show it in a field to copy by hand. */
  const copy = async () => {
    const url = linkTo(id)
    try {
      await navigator.clipboard.writeText(url)
      setManual('')
      say('Link copied')
    } catch {
      setManual(url)
      say('Copy the link from the box')
    }
  }
  const empty = !onDownload && !(rows && rows.length)
  return (
    <div className="chart-actions" role="group" aria-label={`${title}: share and export`}>
      <button type="button" className="toggle-btn" onClick={download} disabled={empty}
        aria-label={`Download ${title} data as CSV`}><span aria-hidden="true">⬇</span> Data (CSV)</button>
      <button type="button" className="toggle-btn" onClick={copy}
        aria-label={`Copy a link to ${title}`}><span aria-hidden="true">🔗</span> Copy link</button>
      {manual && <input className="chart-actions-link" readOnly value={manual} aria-label={`Link to ${title}`}
        onFocus={e => e.target.select()} autoFocus />}
      <span className="chart-actions-msg" role="status" aria-live="polite">{msg}</span>
    </div>
  )
}
