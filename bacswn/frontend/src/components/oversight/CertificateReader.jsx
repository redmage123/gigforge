/**
 * AI reader for sustainable-aviation-fuel certificates (CORSIA oversight page).
 *
 * What: a file picker that sends a proof-of-sustainability document to the
 * server's AI reader and pre-fills the fuel-claim form with what it found.
 *
 * Why: typing batch numbers, masses and life-cycle values from a scanned
 * certificate is slow and error-prone; the AI does the transcription and shows
 * where each value came from, while a person still checks and records the claim.
 *
 * How: the upload goes through the shared aiUpload helpers (size limit, base64
 * body, form filling); the result lists the fields filled, the server's own
 * warnings, notes, and the quoted evidence for each value.
 */
import { useId, useState } from 'react'
import { api } from '../../api/client'
import { ACCEPT_DOCS, fillForm, filledAnnouncement, uploadBody } from './aiUpload'

/** Fuel-claim form field -> label (for the fields-filled list and the evidence). */
const FIELD_LABELS = {
  year: 'Year used', fuel_type: 'Fuel type', mass_t: 'Fuel mass (tonnes)', ls_value: 'Life-cycle value',
  ls_basis: 'Life-cycle value basis', batch_id: 'Batch ID', scheme: 'Certification scheme',
  certificate_ref: 'Certificate / proof of sustainability', pathway: 'Conversion pathway', feedstock: 'Feedstock',
  producer: 'Producer',
}

/**
 * AI-assisted entry for a fuel claim: read a proof-of-sustainability document and
 * pre-fill the form (`formId`). Nothing is recorded; the administrator checks every
 * field and submits the form as usual. Warnings come from the server's own checks.
 * @param {{operatorId: number, formId: string, onFilled?: (message: string) => void}} props
 */
export default function CertificateReader({ operatorId, formId, onFilled }) {
  const id = useId()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  /** Upload the chosen file, fill the form and announce the outcome. */
  const read = async () => {
    if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await api.oversightReadCertificate(operatorId, await uploadBody(file))
      const filled = fillForm(formId, r.fields, FIELD_LABELS, r.provenance)
      setResult({ ...r, filled })
      onFilled?.(filledAnnouncement(filled, file.name, r.warnings))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="cert-reader">
      <div className="cert-reader-row">
        <label htmlFor={`${id}-file`}><b>Fill from certificate (AI)</b></label>
        <input id={`${id}-file`} type="file" accept={ACCEPT_DOCS} aria-describedby={`${id}-hint`}
          onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError('') }} />
        <button type="button" className="btn btn-sm btn-primary" onClick={read} disabled={!file || busy}>
          {busy ? 'Reading…' : 'Read certificate'}
        </button>
      </div>
      <small id={`${id}-hint`} className="co-hint">
        PDF or image of the proof of sustainability, up to 10 MB. AI reads the document and fills in the form below;
        it records nothing. Check every highlighted field against the document before recording the claim.
      </small>
      {error && <p className="co-form-error" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {result && (
          <div className="cert-result">
            <p>
              Read <b>{result.filename}</b>{result.document_kind && ` (${result.document_kind})`}
              {result.operator_on_document && <>; issued to <b>{result.operator_on_document}</b></>}.
              {' '}Filled: {result.filled.length ? result.filled.join(', ') : 'nothing'}.
            </p>
            {result.warnings.length > 0 && (
              <ul className="cert-warnings">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}
            {result.notes.length > 0 && (
              <ul className="cert-notes">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
            {result.evidence.length > 0 && (
              <details>
                <summary>Where each value came from</summary>
                <ul className="cert-notes">{result.evidence.map((e, i) => (
                  <li key={i}><b>{FIELD_LABELS[e.field] || e.field}:</b> “{e.quote}”</li>
                ))}</ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
