import { useEffect, useId, useRef, useState } from 'react'

/**
 * A term with a popup of details, shown on mouse hover AND keyboard focus
 * (or a tap on touch screens). Meets WCAG 1.4.13: the popup can be hovered
 * without disappearing, stays until the pointer/focus leaves, and Esc closes it.
 * A click or tap opens it; tapping elsewhere closes it.
 */
export default function HoverTip({ label, children, className = '' }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('below')
  const id = useId()
  const wrap = useRef(null)
  const hideTimer = useRef(null)
  const pointer = useRef(false)   // focus that comes from a click/tap is handled by onClick

  const show = () => {
    clearTimeout(hideTimer.current)
    const r = wrap.current?.getBoundingClientRect()
    if (r) setSide(window.innerHeight - r.bottom < 260 && r.top > 260 ? 'above' : 'below')
    setOpen(true)
  }
  // Small delay so the pointer can travel from the term into the popup.
  const hide = () => { hideTimer.current = setTimeout(() => setOpen(false), 120) }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  return (
    <span ref={wrap} className={`hovertip ${className}`} onMouseEnter={show} onMouseLeave={hide}>
      <button type="button" className="hovertip-term" aria-describedby={open ? id : undefined} aria-expanded={open}
        onPointerDown={() => { pointer.current = true }}
        onFocus={() => { if (!pointer.current) show() }} onBlur={hide}
        onClick={() => {
          // Mouse/touch: hover may already have opened it, so a click only ever opens
          // (tap elsewhere or Esc closes). Keyboard Enter/Space toggles.
          if (pointer.current) { pointer.current = false; show() } else if (open) setOpen(false); else show()
        }}>
        {label}
      </button>
      {open && (
        <span role="tooltip" id={id} className={`hovertip-pop ${side}`}>
          {children}
        </span>
      )}
    </span>
  )
}
