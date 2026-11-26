/**
 * Dialog: the app's one modal dialog component (alert details and others).
 *
 * Why: the native <dialog> provides the focus trap, Esc handling and inert
 * background; this wrapper adds the remaining WCAG requirements (focus to the
 * title on open, focus returned to the opener, a labelled scrollable body).
 * How: `open` drives showModal()/close(); every way of closing (Esc, the Close
 * button, a backdrop click) goes through the element's close event -> onClose.
 */
import { useEffect, useId, useRef } from 'react'

/**
 * Accessible modal dialog on the native <dialog> element: focus is moved to the
 * title on open and kept inside, Esc closes, a backdrop click closes, and focus
 * returns to whatever opened it (WCAG 2.1.2, 2.4.3, 4.1.2).
 * @param {{open: boolean, title: string, onClose?: () => void, children?: any,
 *   wide?: boolean, actions?: any}} props `actions`: extra buttons beside Close
 */
export default function Dialog({ open, title, onClose, children, wide = false, actions = null }) {
  const ref = useRef(null)
  const titleRef = useRef(null)
  const opener = useRef(null)
  const id = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement
      d.showModal()
      titleRef.current?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  // Return focus once the dialog has closed (on unmount too).
  useEffect(() => () => { opener.current?.focus?.() }, [])
  /** Native close event: notify the parent, then return focus to the opener. */
  const handleClose = () => {
    onClose?.()
    requestAnimationFrame(() => opener.current?.focus?.())
  }

  return (
    <dialog ref={ref} className={`a11y-dialog ${wide ? 'wide' : ''}`} aria-labelledby={`${id}-t`}
      onClose={handleClose}
      onClick={(e) => { if (e.target === ref.current) ref.current.close() }}>
      {open && (
        <div className="a11y-dialog-inner">
          <div className="a11y-dialog-head">
            <h3 id={`${id}-t`} tabIndex={-1} ref={titleRef}>{title}</h3>
            <div className="a11y-dialog-actions">
              {actions}
              <button type="button" className="btn btn-sm" onClick={() => ref.current?.close()}>Close</button>
            </div>
          </div>
          {/* Focusable so keyboard users can scroll a long body (WCAG 2.1.1). */}
          <div className="a11y-dialog-body" tabIndex={0} role="region" aria-labelledby={`${id}-t`}>{children}</div>
        </div>
      )}
    </dialog>
  )
}
