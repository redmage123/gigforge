/**
 * AI document readers for the CORSIA oversight forms.
 *
 * What: AiDocReader (upload a verified emissions report or a unit cancellation
 * certificate and pre-fill the matching form) and AiResult (the shared summary
 * of what the AI read: fields filled, warnings, comparisons, notes, evidence).
 *
 * Why: transcribing figures from PDFs is slow and error-prone; the AI does the
 * reading, the server checks the result, and a person verifies and records.
 *
 * How: the upload uses the shared aiUpload helpers; nothing is recorded until
 * the administrator submits the form as usual.
 */
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { ACCEPT_ANY, ACCEPT_DOCS, fillForm, filledAnnouncement, uploadBody } from './aiUpload'

/** Visible wording per document kind. */
const COPY = {
  report: { title: 'Fill from emissions report (AI)', button: 'Read report',
    hint: 'PDF or image of the verified emissions report or verification statement, up to 10 MB.' },
  cancellation: { title: 'Fill from cancellation certificate (AI)', button: 'Read certificate',
    hint: 'PDF, image or text of the registry cancellation / retirement certificate, up to 10 MB.' },
}

/**
 * AI-assisted entry: read a document and pre-fill the form `formId`. Nothing is
 * recorded; the administrator checks every highlighted field and submits as usual.
 * Warnings come from the server's own checks, not from the AI.
 * @param {{kind: 'report'|'cancellation', labels: object, formId: string, operatorId: number,
 *   period: string, onFilled?: (message: string) => void}} props
 *   `kind`: verified emissions report | unit cancellation certificate; `labels`: field name -> label
 */
export default function AiDocReader({ kind, labels, formId, operatorId, period, onFilled }) {
  const id = useId()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const copy = COPY[kind]

  /** Upload the chosen file, fill the form and announce the outcome. */
  const read = async () => {
    if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await api.oversightAiRead(kind, await uploadBody(file, { operator_id: operatorId, period }))
      const filled = fillForm(formId, r.fields, labels, r.provenance)
      setResult({ ...r, filled })
      onFilled?.(filledAnnouncement(filled, file.name, r.warnings))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="cert-reader">
      <div className="cert-reader-row">
        <label htmlFor={`${id}-file`}><b>{copy.title}</b></label>
        <input id={`${id}-file`} type="file" accept={kind === 'report' ? ACCEPT_DOCS : ACCEPT_ANY} aria-describedby={`${id}-hint`}
          onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError('') }} />
        <button type="button" className="btn btn-sm btn-primary" onClick={read} disabled={!file || busy}>
          {busy ? 'Reading…' : copy.button}
        </button>
      </div>
      <small id={`${id}-hint`} className="co-hint">
        {copy.hint} AI reads the document and fills in the form below; it records nothing. Check every highlighted
        field against the document before recording.
      </small>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {result && <AiResult result={result} labels={labels} />}
      </div>
    </div>
  )
}

/**
 * Summary of an AI document read (used by AiDocReader and the letters-of-authorisation reader).
 * @param {{result: object, labels?: object}} props `result.filled` is optional (absent: nothing filled is listed)
 */
export function AiResult({ result, labels = {} }) {
  return (
    <div className="cert-result">
      <p>
        Read <b>{result.filename}</b>{result.document_kind && ` (${result.document_kind})`}
        {result.operator_on_document && <>; names <b>{result.operator_on_document}</b></>}.
        {result.filled && <> Filled: {result.filled.length ? result.filled.join(', ') : 'nothing'}.</>}
      </p>
      {result.warnings?.length > 0 && <ul className="cert-warnings">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {result.comparison?.length > 0 && <ul className="cert-notes">{result.comparison.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {result.notes?.length > 0 && <ul className="cert-notes">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {result.evidence?.length > 0 && (
        <details>
          <summary>Where each value came from</summary>
          <ul className="cert-notes">{result.evidence.map((e, i) => (
            <li key={i}><b>{labels[e.field] || e.field}:</b> “{e.quote}”</li>
          ))}</ul>
        </details>
      )}
    </div>
  )
}
