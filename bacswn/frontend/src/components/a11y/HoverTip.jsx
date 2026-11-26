/**
 * HoverTip: an accessible hover/focus popup for explaining a term.
 *
 * Why: plain `title` tooltips are unreachable by keyboard and touch and vanish
 * when the pointer moves onto them; WCAG 1.4.13 requires content on hover or
 * focus to be dismissible, hoverable and persistent.
 * How: the term is a button; the popup is a role="tooltip" referenced by
 * aria-describedby while open, placed above or below depending on the room
 * left in the viewport.
 */
import { useEffect, useId, useRef, useState } from 'react'

/**
 * A term with a popup of details, shown on mouse hover AND keyboard focus
 * (or a tap on touch screens). Meets WCAG 1.4.13: the popup can be hovered
 * without disappearing, stays until the pointer/focus leaves, and Esc closes it.
 * A click or tap opens it; tapping elsewhere closes it.
 * @param {{label: any, children: any, className?: string}} props `label`: the term; `children`: the popup
 */
export default function HoverTip({ label, children, className = '' }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('below')
  const id = useId()
  const wrap = useRef(null)
  const hideTimer = useRef(null)
  const pointer = useRef(false)   // focus that comes from a click/tap is handled by onClick

  /** Open the popup on whichever side of the term has room. */
  const show = () => {
    clearTimeout(hideTimer.current)
    const r = wrap.current?.getBoundingClientRect()
    if (r) setSide(window.innerHeight - r.bottom < 260 && r.top > 260 ? 'above' : 'below')
    setOpen(true)
  }
  /** Close after a short delay, so the pointer can travel from the term into the popup. */
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
