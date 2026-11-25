/** Shared helpers for AI document uploads on the CORSIA oversight page. */

export const MAX_UPLOAD = 10 * 1024 * 1024
export const ACCEPT_DOCS = 'application/pdf,image/png,image/jpeg,image/webp'
export const ACCEPT_ANY = `${ACCEPT_DOCS},.csv,.txt,.tsv,.json,.html,.htm,.eml,.md,.xml,text/csv,text/plain`

export const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] || '')
  r.onerror = () => reject(new Error('The file could not be read'))
  r.readAsDataURL(file)
})

/** The request body for an uploaded file; throws a readable error if it is too large. */
export async function uploadBody(file, extra = {}) {
  if (file.size > MAX_UPLOAD) throw new Error('The file is larger than 10 MB.')
  return { filename: file.name, media_type: file.type || '', data: await toBase64(file), ...extra }
}

/** Put AI-read values into a form's fields and mark them for checking; returns the labels filled. */
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
