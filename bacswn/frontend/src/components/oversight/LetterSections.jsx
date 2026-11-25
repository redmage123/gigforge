import { useCallback, useEffect, useId, useState } from 'react'
import { api } from '../../api/client'
import { ACCEPT_ANY, ACCEPT_DOCS, fillForm, uploadBody } from './aiUpload'
import { AiResult } from './AiDocReader'

const n = (v) => (v == null ? '—' : Number(v).toLocaleString())
const LOA_LABELS = {
  reference: 'Reference', issue_date: 'Issue date', issuing_body: 'Issuing body', authorised_uses: 'Authorised uses',
  corresponding_adjustment: 'Corresponding adjustment', vintage_from: 'Vintage from', vintage_to: 'Vintage to',
  max_quantity: 'Maximum quantity', serial_blocks: 'Serial blocks', project_id: 'Project ID', project_name: 'Project name',
}

/** Labelled field for the small forms in this file. */
function F({ label, hint, ...props }) {
  const id = useId()
  return (
    <div className="co-field">
      <label htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
      <input id={id} aria-describedby={hint ? `${id}-h` : undefined} {...props} />
      {hint && <small id={`${id}-h`} className="co-hint">{hint}</small>}
    </div>
  )
}

/** Letters of authorisation: list, AI reading, and recording (append-only). */
export function Letters({ isAdmin, aiReady, announce, onChanged }) {
  const fileId = useId()
  const formId = `co-loa-form-${fileId.replace(/:/g, '')}`
  const [letters, setLetters] = useState([])
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const load = useCallback(() => api.nerAuthorisations().then(d => setLetters(d.authorisations)).catch(() => setLetters([])), [])
  useEffect(() => { load() }, [load])

  const read = async () => {
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await api.oversightAiRead('authorisation', await uploadBody(file))
      const filled = fillForm(formId, r.fields, LOA_LABELS, r.provenance)
      setResult({ ...r, filled })
      announce(`${filled.length} fields filled from ${file.name}; ${r.warnings.length} warnings. Check before recording.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const record = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const d = Object.fromEntries(new FormData(form).entries())
    d.corresponding_adjustment = form.elements.corresponding_adjustment.checked
    setFormError('')
    try {
      const r = await api.nerAddAuthorisation(d)
      form.reset(); form.querySelectorAll('.ai-filled').forEach(el => el.classList.remove('ai-filled'))
      setResult(null)
      announce(`Letter ${r.reference} recorded. Registry claims re-checked against it.`)
      load(); onChanged?.()
    } catch (err) { setFormError(err.message) }
  }

  return (
    <>
      <h4 id="co-loa-h">Letters of authorisation</h4>
      <p className="co-note">
        Letters the state has issued for Bahamian units. Once letters are kept here, registry claims are also checked
        against the letter each registry row cites: CORSIA use, vintages and the authorised quantity.
      </p>
      {letters.length === 0 ? <p className="co-dim">No letters recorded.</p> : (
        <div className="table-scroll" role="region" aria-labelledby="co-loa-h" tabIndex={0}>
          <table className="data-table co-table">
            <thead><tr><th scope="col">Reference</th><th scope="col">Issued</th><th scope="col">Uses</th>
              <th scope="col">Adjustment</th><th scope="col">Vintages</th><th scope="col">Units in registry / authorised</th><th scope="col">Recorded</th></tr></thead>
            <tbody>{letters.map(a => (
              <tr key={a.id}>
                <th scope="row">{a.reference}{a.project_name && <small className="co-dim"><br />{a.project_name}</small>}</th>
                <td>{a.issue_date}{a.issuing_body && <small className="co-dim"><br />{a.issuing_body}</small>}</td>
                <td>{a.authorised_uses.split(';').filter(Boolean).join(', ') || '—'}</td>
                <td>{a.corresponding_adjustment ? 'Committed' : <span className="co-badge warn">Not committed</span>}</td>
                <td>{a.vintage_from || '…'}–{a.vintage_to || '…'}</td>
                <td className="num">{n(a.units_in_registry)} / {n(a.max_quantity)}{a.over_limit && <><br /><span className="co-badge bad">Over the limit</span></>}</td>
                <td>{a.created_by}, {a.created_at.slice(0, 10)}{a.notes.startsWith('Pre-filled by AI') && <small className="co-dim"><br />AI-assisted</small>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {isAdmin && (
        <details className="co-forms">
          <summary>Record a letter of authorisation</summary>
          {aiReady && (
            <div className="cert-reader">
              <div className="cert-reader-row">
                <label htmlFor={fileId}><b>Fill from the letter (AI)</b></label>
                <input id={fileId} type="file" accept={ACCEPT_DOCS} onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }} />
                <button type="button" className="btn btn-sm btn-primary" onClick={read} disabled={!file || busy}>{busy ? 'Reading…' : 'Read letter'}</button>
              </div>
              <small className="co-hint">PDF or image of the letter. AI fills in the form and compares the letter with the latest registry statement; it records nothing.</small>
              {error && <p className="co-form-error" role="alert">{error}</p>}
              <div role="status" aria-live="polite">{result && <AiResult result={result} labels={LOA_LABELS} />}</div>
            </div>
          )}
          <form id={formId} className="co-form" onSubmit={record} aria-label="Record letter of authorisation">
            <div className="co-form-grid">
              <F label="Reference" name="reference" required maxLength={120} />
              <F label="Issue date" name="issue_date" type="date" required max={new Date().toISOString().slice(0, 10)} />
              <F label="Issuing body" name="issuing_body" maxLength={200} />
              <F label="Authorised uses" name="authorised_uses" maxLength={120} hint="Codes separated by ; e.g. CORSIA;OIMP" />
              <F label="Vintage from" name="vintage_from" type="number" min={2000} max={2100} />
              <F label="Vintage to" name="vintage_to" type="number" min={2000} max={2100} />
              <F label="Maximum quantity (units)" name="max_quantity" type="number" min={1} step={1} />
              <F label="Serial blocks" name="serial_blocks" maxLength={2000} hint="Separated by ;" />
              <F label="Project ID" name="project_id" maxLength={80} />
              <F label="Project name" name="project_name" maxLength={200} />
              <div className="co-field co-check">
                <label><input type="checkbox" name="corresponding_adjustment" /> Commits to a corresponding adjustment</label>
              </div>
              <input type="hidden" name="notes" />
            </div>
            {formError && <p className="co-form-error" role="alert">{formError}</p>}
            <button type="submit" className="btn btn-primary btn-sm">Record letter</button>
          </form>
          <p className="co-note">Letters are kept permanently; recording the same reference again adds a revision, and the newest one is used.</p>
        </details>
      )}
    </>
  )
}

/** Convert a registry extract in any layout into a statement with AI, preview it, then import it. */
export function ConvertExtract({ announce, onImported }) {
  const id = useId(), asOfId = useId(), refId = useId()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [asOf, setAsOf] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const convert = async () => {
    setBusy(true); setError(''); setRes(null)
    try {
      const r = await api.oversightAiRead('statement', await uploadBody(file))
      setRes(r); setAsOf(r.as_of || ''); setReference(r.reference || '')
      announce(`${r.units.length} rows read from ${file.name}. ${r.errors.length ? 'It cannot be imported as it stands.' : 'Check the preview, then import.'}`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const doImport = async () => {
    setError('')
    try {
      const r = await api.nerImport({ format: 'json', content: res.content, as_of: asOf, reference, source_note: res.source_note })
      announce(`Statement of ${r.as_of} imported: ${n(r.units_total)} units. Claims re-checked.`)
      setRes(null); setFile(null); onImported?.()
    } catch (e) { setError(e.message) }
  }
  return (
    <div className="cert-reader">
      <div className="cert-reader-row">
        <label htmlFor={id}><b>Convert a registry file (AI)</b></label>
        <input id={id} type="file" accept={ACCEPT_ANY} aria-describedby={`${id}-hint`} onChange={e => { setFile(e.target.files?.[0] || null); setRes(null) }} />
        <button type="button" className="btn btn-sm btn-primary" onClick={convert} disabled={!file || busy}>{busy ? 'Reading…' : 'Convert'}</button>
      </div>
      <small id={`${id}-hint`} className="co-hint">
        A registry extract in any layout (PDF, scan, CSV export, email text), up to 10 MB and {n(500)} rows. AI turns it into
        statement rows; you check the preview and import it. Spreadsheets: save as CSV first.
      </small>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {res && (
          <div className="cert-result">
            <p>Read <b>{res.filename}</b>{res.document_kind && ` (${res.document_kind})`}: {n(res.units.length)} rows.</p>
            {res.errors.length > 0 && <ul className="cert-warnings">{res.errors.map((e, i) => <li key={i}>Cannot import: {e}</li>)}</ul>}
            {res.warnings.length > 0 && <ul className="cert-warnings">{res.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            {res.notes.length > 0 && <ul className="cert-notes">{res.notes.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            {res.units.length > 0 && (
              <div className="table-scroll" role="region" aria-label="Rows read from the file" tabIndex={0}>
                <table className="data-table co-table">
                  <thead><tr><th scope="col">Serials</th><th scope="col">Vintage</th><th scope="col">Status</th><th scope="col">Authorisation</th>
                    <th scope="col">Adjustment</th><th scope="col">Cancelled for / by</th><th scope="col">Reference</th></tr></thead>
                  <tbody>{res.units.slice(0, 50).map((u, i) => (
                    <tr key={i}>
                      <th scope="row">{u.serial_block} {u.serial_start}–{u.serial_end}</th><td>{u.vintage}</td><td>{u.status || '—'}</td>
                      <td>{u.authorisation_ref || '—'}{u.authorised_uses?.length > 0 && <small className="co-dim"><br />{u.authorised_uses.join(', ')}</small>}</td>
                      <td>{u.corresponding_adjustment ? 'Yes' : 'No'}</td>
                      <td>{[u.cancelled_for, u.cancelled_by].filter(Boolean).join(' / ') || '—'}{u.cancelled_on && <small className="co-dim"><br />{u.cancelled_on}</small>}</td>
                      <td>{u.cancellation_ref || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {res.units.length > 50 && <p className="co-dim">First 50 of {n(res.units.length)} rows shown.</p>}
              </div>
            )}
            <div className="co-form-grid">
              <div className="co-field"><label htmlFor={asOfId}>Statement date (as of) *</label>
                <input id={asOfId} type="date" value={asOf} onChange={e => setAsOf(e.target.value)} max={new Date().toISOString().slice(0, 10)} /></div>
              <div className="co-field"><label htmlFor={refId}>Statement reference</label>
                <input id={refId} value={reference} onChange={e => setReference(e.target.value)} maxLength={120} /></div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={doImport} disabled={res.errors.length > 0 || !asOf || !res.units.length}>
              Import this statement</button>
          </div>
        )}
      </div>
    </div>
  )
}
