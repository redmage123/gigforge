import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api, saveBlob } from '../../api/client'

/**
 * Bahamas National Emissions Registry exchange. The registry has no public
 * API, so statements (registry extracts of Bahamian units) are imported as
 * files and the state report is exported for submission.
 */

const MAX_BYTES = 5_000_000
const n = (v) => (v == null ? '—' : Number(v).toLocaleString())
const STATUS_LABEL = { ISSUED: 'issued', TRANSFERRED: 'transferred', CANCELLED: 'cancelled', RETIRED: 'retired', SUSPENDED: 'suspended' }

export default function NerPanel({ period, isAdmin, announce, onImported }) {
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const errRef = useRef(null)
  const fileId = useId()
  const asOfId = useId()
  const refId = useId()

  const load = useCallback(() => {
    api.nerStatus().then(setStatus).catch(() => setStatus(null))
    api.nerStatements().then(d => setHistory(d.statements)).catch(() => setHistory([]))
  }, [])
  useEffect(() => { load() }, [load])

  const download = async (fn, name, what) => {
    try { saveBlob(await fn(), name); announce(`${what} downloaded`) } catch (e) { announce(e.message) }
  }

  const fail = (msg) => { setError(msg); requestAnimationFrame(() => errRef.current?.focus()) }

  const submit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const file = form.elements.file.files[0]
    setError('')
    if (!file) return fail('Choose a statement file (.json or .csv).')
    if (file.size > MAX_BYTES) return fail('The file is larger than 5 MB.')
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : file.name.toLowerCase().endsWith('.json') ? 'json' : ''
    if (!format) return fail('The file must be .json or .csv.')
    setBusy(true)
    try {
      const content = await file.text()
      const r = await api.nerImport({ format, content, as_of: form.elements.as_of.value, reference: form.elements.reference.value })
      form.reset()
      announce(`Registry statement of ${r.as_of} imported: ${n(r.unit_rows)} rows, ${n(r.units_total)} units. Claims re-checked.`)
      load(); onImported?.()
    } catch (err) { fail(err.message) } finally { setBusy(false) }
  }

  const latest = status?.latest
  const sum = status?.latest_summary
  return (
    <section className="card" aria-labelledby="co-ner-h">
      <div className="card-header"><h3 id="co-ner-h">Bahamas National Emissions Registry</h3></div>
      <p className="co-note">
        Claims that name the National Emissions Registry are checked against its latest statement: the units must be
        authorised for CORSIA, carry a corresponding adjustment, and be cancelled for CORSIA by the operator making
        the claim. {status?.connection_note}
      </p>
      {!latest ? (
        <p className="co-dim">No registry statement imported yet, so registry claims cannot be checked.</p>
      ) : (
        <dl className="co-ner-facts">
          <div><dt>Latest statement</dt><dd>as of {latest.as_of}{latest.reference && ` · ${latest.reference}`}</dd></div>
          <div><dt>Units listed</dt><dd>{n(latest.units_total)} in {n(latest.unit_rows)} rows
            {sum && Object.keys(sum.by_status).length > 0 && (
              <small className="co-dim"><br />{Object.entries(sum.by_status).map(([s, v]) => `${n(v)} ${STATUS_LABEL[s] || s}`).join(', ')}</small>
            )}</dd></div>
          {sum && <div><dt>Authorised for CORSIA</dt><dd>{n(sum.corsia_authorised)} <small className="co-dim">({n(sum.adjusted)} with corresponding adjustment)</small></dd></div>}
          {sum && <div><dt>Cancelled for CORSIA</dt><dd>{n(sum.cancelled_for_corsia)}</dd></div>}
          <div><dt>Imported</dt><dd>by {latest.imported_by}, {latest.created_at.slice(0, 16).replace('T', ' ')}</dd></div>
        </dl>
      )}
      <div className="co-head-actions">
        <button type="button" className="toggle-btn" disabled={!period}
          onClick={() => download(() => api.nerStateReport(period), `ner-state-report-${period}.json`, 'State report')}>
          Export state report for the registry (JSON)</button>
        <button type="button" className="toggle-btn"
          onClick={() => download(api.nerTemplate, 'ner-statement-template.csv', 'Statement template')}>
          Statement template (CSV)</button>
      </div>
      {history.length > 1 && (
        <details className="co-forms">
          <summary>Statement history ({history.length})</summary>
          <ul className="co-history">
            {history.map(s => <li key={s.id}>as of {s.as_of}{s.reference && ` · ${s.reference}`} · {n(s.units_total)} units ·
              {s.source_format.toUpperCase()} · imported by {s.imported_by}, {s.created_at.slice(0, 10)}</li>)}
          </ul>
        </details>
      )}
      {isAdmin && (
        <details className="co-forms">
          <summary>Import a registry statement</summary>
          <form className="co-form" onSubmit={submit} aria-label="Import registry statement">
            <div className="co-form-grid">
              <div className="co-field">
                <label htmlFor={fileId}>Statement file<span aria-hidden="true"> *</span></label>
                <input id={fileId} name="file" type="file" accept=".json,.csv,application/json,text/csv" required
                  aria-describedby={`${fileId}-hint`} />
                <small id={`${fileId}-hint`} className="co-hint">JSON or CSV extract from the registry, up to 5 MB. Columns as in the template.</small>
              </div>
              <div className="co-field">
                <label htmlFor={asOfId}>Statement date (as of)</label>
                <input id={asOfId} name="as_of" type="date" max={new Date().toISOString().slice(0, 10)} aria-describedby={`${asOfId}-hint`} />
                <small id={`${asOfId}-hint`} className="co-hint">Required for CSV; a JSON statement may carry its own.</small>
              </div>
              <div className="co-field">
                <label htmlFor={refId}>Statement reference</label>
                <input id={refId} name="reference" maxLength={120} />
              </div>
            </div>
            <div ref={errRef} tabIndex={-1} role="alert" className="co-form-error">{error}</div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Importing…' : 'Import statement'}</button>
          </form>
          <p className="co-note">Statements are kept permanently. The newest by statement date is used for checks.</p>
        </details>
      )}
    </section>
  )
}
