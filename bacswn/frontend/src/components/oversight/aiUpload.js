/**
 * Shared helpers for AI document uploads on the CORSIA oversight page.
 *
 * What: file-type and size limits, conversion of a File to the JSON upload body
 * the AI endpoints expect, pre-filling a form from the AI's answer, and the
 * announcement read out afterwards.
 *
 * Why: several readers (emissions reports, cancellation and fuel certificates,
 * letters of authorisation, registry extracts, rules documents) upload files the
 * same way; keeping it here means one size limit, one error type and one
 * definition of "AI-filled" field.
 *
 * How: files are sent inline as base64 (`data`) with their name and media type;
 * oversized or unreadable files raise UploadError before anything is sent.
 */
import { UploadError } from '../../api/errors'

/** Largest file the AI readers accept (the server enforces the same limit). */
export const MAX_UPLOAD = 10 * 1024 * 1024
/** `accept` list for document readers: PDF and common images. */
export const ACCEPT_DOCS = 'application/pdf,image/png,image/jpeg,image/webp'
/** `accept` list for readers that also take text exports (CSV, e-mail, HTML…). */
export const ACCEPT_ANY = `${ACCEPT_DOCS},.csv,.txt,.tsv,.json,.html,.htm,.eml,.md,.xml,text/csv,text/plain`

/**
 * Read a File as base64 (without the `data:…;base64,` prefix).
 * @param {File} file
 * @returns {Promise<string>}
 * @throws {UploadError} if the browser cannot read the file
 */
export const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] || '')
  r.onerror = () => reject(new UploadError('The file could not be read'))
  r.readAsDataURL(file)
})

/**
 * The JSON request body for an uploaded file.
 * @param {File} file
 * @param {object} [extra] additional fields to send (e.g. operator_id, period)
 * @returns {Promise<{filename: string, media_type: string, data: string}>}
 * @throws {UploadError} if the file is larger than MAX_UPLOAD or cannot be read
 */
export async function uploadBody(file, extra = {}) {
  if (file.size > MAX_UPLOAD) throw new UploadError('The file is larger than 10 MB.')
  return { filename: file.name, media_type: file.type || '', data: await toBase64(file), ...extra }
}

/**
 * Put AI-read values into a form's fields and mark them (`.ai-filled`) for the
 * user to check. Empty values are skipped; checkboxes are ticked or cleared.
 * The provenance note goes into the form's `notes` field, if it has one.
 * @param {string} formId id of the <form>
 * @param {object} fields field name -> value, as read by the AI
 * @param {object} labels field name -> human label
 * @param {string} [provenance] where the values came from
 * @returns {string[]} labels of the fields filled
 */
export function fillForm(formId, fields, labels, provenance) {
  const form = document.getElementById(formId)
  if (!form) return []
  const filled = []
  for (const [name, value] of Object.entries(fields)) {
    const el = form.elements.namedItem(name)
    if (!el || value === null || value === undefined || value === '') continue
    if (el.type === 'checkbox') el.checked = !!value
    else el.value = String(value)
    el.classList.add('ai-filled')
    filled.push(labels[name] || name)
  }
  const notes = form.elements.namedItem('notes')
  if (notes && provenance) notes.value = provenance
  return filled
}

/**
 * Screen-reader announcement after a document has pre-filled a form.
 * @param {string[]} filled labels of the fields filled
 * @param {string} filename
 * @param {string[]} warnings the server's checks on the document
 * @returns {string}
 */
export const filledAnnouncement = (filled, filename, warnings) =>
  `${filled.length} fields filled from ${filename}. ${warnings.length} warning${warnings.length === 1 ? '' : 's'}. Check every field before recording.`
