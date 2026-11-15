import { useId, useState } from 'react'
import { api } from '../../api/client'

const FIELD_LABELS = {
  year: 'Year used', fuel_type: 'Fuel type', mass_t: 'Fuel mass (tonnes)', ls_value: 'Life-cycle value',
  ls_basis: 'Life-cycle value basis', batch_id: 'Batch ID', scheme: 'Certification scheme',
  certificate_ref: 'Certificate / proof of sustainability', pathway: 'Conversion pathway', feedstock: 'Feedstock',
  producer: 'Producer',
}
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] || '')
  r.onerror = () => reject(new Error('The file could not be read'))
  r.readAsDataURL(file)
})

/**
 * AI-assisted entry for a fuel claim: read a proof-of-sustainability document and
 * pre-fill the form (`formId`). Nothing is recorded; the administrator checks every
 * field and submits the form as usual. Warnings come from the server's own checks.
 */
export default function CertificateReader({ operatorId, formId, onFilled }) {
  const id = useId()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const fill = (fields, provenance) => {
    const form = document.getElementById(formId)
    if (!form) return []
    const filled = []
    for (const [name, value] of Object.entries(fields)) {
      const el = form.elements.namedItem(name)
      if (!el || value === null || value === undefined || value === '') continue
      el.value = String(value)
      el.classList.add('ai-filled')
      filled.push(FIELD_LABELS[name] || name)
    }
    const notes = form.elements.namedItem('notes')
    if (notes) notes.value = provenance
    return filled
  }

  const read = async () => {
    if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('The file is larger than 10 MB.')
      const data = await toBase64(file)
      const r = await api.oversightReadCertificate(operatorId, { filename: file.name, media_type: file.type, data })
      const filled = fill(r.fields, r.provenance)
      setResult({ ...r, filled })
      onFilled?.(`${filled.length} fields filled from ${file.name}. ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}. Check every field before recording.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="cert-reader">
      <div className="cert-reader-row">
        <label htmlFor={`${id}-file`}><b>Fill from certificate (AI)</b></label>
        <input id={`${id}-file`} type="file" accept={ACCEPT} aria-describedby={`${id}-hint`}
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
