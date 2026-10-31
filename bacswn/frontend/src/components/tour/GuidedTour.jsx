import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOUR_STEPS } from '../../tour/steps'
import { useA11yPrefs, usePrefersReducedMotion } from '../../hooks/useA11yPrefs'

const SPEECH_OK = typeof window !== 'undefined' && 'speechSynthesis' in window
const TARGET_WAIT_MS = 6000

/**
 * Guided demo. A non-modal panel (the page stays usable) that walks through
 * TOUR_STEPS: navigate → run the step's action → highlight its target → show
 * the caption. Keyboard and screen-reader friendly: captions are announced,
 * focus moves to the caption only when the user advanced it, Esc exits.
 * Auto-advance can be paused at any time (WCAG 2.2.1 / 2.2.2); captions can be
 * read aloud at the user's preferred speaking rate.
 */
export default function GuidedTour({ open, onClose }) {
  const navigate = useNavigate()
  const [prefs] = useA11yPrefs()
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(false)
  const [speak, setSpeak] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [minimised, setMinimised] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [side, setSide] = useState('right')
  const headingRef = useRef(null)
  const highlighted = useRef([])
  const focusOnChange = useRef(true)
  const runId = useRef(0)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1

  const clearHighlight = () => {
    highlighted.current.forEach(el => el.classList.remove('tour-highlight'))
    highlighted.current = []
  }

  // Enter a step: navigate, act, highlight, announce.
  useEffect(() => {
    if (!open) return
    const id = ++runId.current
    clearHighlight()
    setBusy(true)
    setNote('')
    if (SPEECH_OK) window.speechSynthesis.cancel()
    navigate(step.path)
    ;(async () => {
      try {
        await step.action?.()
        // Give the live simulation time to show what the caption describes.
        if (step.settleMs) await new Promise(r => setTimeout(r, step.settleMs))
      } catch (e) {
        if (id === runId.current) setNote(`This step's demo action could not run: ${e.message}`)
      }
      // Wait for the target to render on the new page.
      const started = Date.now()
      let el = null
      while (id === runId.current && Date.now() - started < TARGET_WAIT_MS) {
        el = step.target ? document.querySelector(step.target) : null
        if (el || !step.target) break
        await new Promise(r => setTimeout(r, 150))
      }
      if (id !== runId.current) return
      if (el) {
        el.classList.add('tour-highlight')
        highlighted.current = [el]
        el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
        // Keep the caption off the highlighted area: sit on the opposite side.
        const r = el.getBoundingClientRect()
        setSide(r.left + r.width / 2 > window.innerWidth * 0.6 ? 'left' : 'right')
      } else {
        setSide('right')
      }
      setBusy(false)
      if (focusOnChange.current) headingRef.current?.focus({ preventScroll: true })
      if (speak && SPEECH_OK) {
        const u = new SpeechSynthesisUtterance(`${step.title}. ${step.body.join(' ')}`)
        u.rate = prefs.speechRate
        window.speechSynthesis.speak(u)
      }
    })()
  }, [open, index]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance (pausable). Counts down only once the step has settled.
  useEffect(() => {
    if (!open || !auto || busy || last || !step.seconds) { setRemaining(null); return }
    let left = step.seconds
    setRemaining(left)
    const t = setInterval(() => {
      left -= 1
      setRemaining(left)
      if (left <= 0) {
        clearInterval(t)
        focusOnChange.current = false        // don't yank focus during hands-off playback
        setIndex(i => Math.min(i + 1, TOUR_STEPS.length - 1))
      }
    }, 1000)
    return () => clearInterval(t)
  }, [open, auto, busy, index]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((delta) => {
    focusOnChange.current = true
    setIndex(i => Math.max(0, Math.min(TOUR_STEPS.length - 1, i + delta)))
  }, [])

  const exit = useCallback(() => {
    runId.current++
    clearHighlight()
    if (SPEECH_OK) window.speechSynthesis.cancel()
    setAuto(false)
    setIndex(0)
    onClose()
  }, [onClose])

  useEffect(() => { if (!open) clearHighlight() }, [open])
  useEffect(() => () => { clearHighlight(); if (SPEECH_OK) window.speechSynthesis.cancel() }, [])

  if (!open) return null
  return (
    <section className={`tour-panel ${side} ${minimised ? 'min' : ''}`} role="dialog" aria-modal="false" aria-labelledby="tour-h"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); exit() } }}>
      <div className="tour-top">
        <span className="tour-count">Guided demo · step {index + 1} of {TOUR_STEPS.length}</span>
        <button type="button" className="tour-icon-btn" onClick={() => setMinimised(m => !m)} aria-expanded={!minimised}
          aria-label={minimised ? 'Show tour caption' : 'Minimise tour caption'}>{minimised ? '▴' : '▾'}</button>
      </div>
      <div className="tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin={1}
        aria-valuemax={TOUR_STEPS.length} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }} />
      </div>
      <h2 id="tour-h" tabIndex={-1} ref={headingRef}>{step.title}</h2>
      {!minimised && (
        <div className="tour-body" aria-live={focusOnChange.current ? 'off' : 'polite'}>
          {step.body.map((p, i) => <p key={i}>{p}</p>)}
          {busy && <p className="tour-dim" role="status">Setting up this step…</p>}
          {note && <p className="tour-warn" role="alert">{note}</p>}
        </div>
      )}
      <div className="tour-controls">
        <button type="button" className="btn btn-sm" onClick={() => go(-1)} disabled={index === 0}>Back</button>
        {last
          ? <button type="button" className="btn btn-sm btn-primary" onClick={exit}>Finish</button>
          : <button type="button" className="btn btn-sm btn-primary" onClick={() => go(1)}>Next</button>}
        <button type="button" className="toggle-btn" aria-pressed={auto} onClick={() => { focusOnChange.current = !auto ? false : true; setAuto(a => !a) }}>
          {auto ? `Pause${remaining != null ? ` (${remaining}s)` : ''}` : 'Auto-advance'}
        </button>
        {SPEECH_OK && (
          <button type="button" className="toggle-btn" aria-pressed={speak}
            onClick={() => { if (speak && SPEECH_OK) window.speechSynthesis.cancel(); setSpeak(s => !s) }}>
            {speak ? 'Stop reading' : 'Read aloud'}
          </button>
        )}
        <button type="button" className="btn btn-sm tour-exit" onClick={exit} aria-label="Exit guided demo">Exit</button>
      </div>
    </section>
  )
}
