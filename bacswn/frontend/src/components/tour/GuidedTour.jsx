/**
 * GuidedTour: the player for the guided demo and for guided stories.
 *
 * What: a non-modal caption panel that steps through a list of steps (by
 * default TOUR_STEPS; stories pass their own), driving the app as it goes.
 *
 * Why: lets a presenter (or a visitor on their own) see the platform's key
 * features in order, with the screen set up to match each caption.
 *
 * How: entering a step navigates, runs its action, waits for its target to
 * render, highlights it and places the panel beside it. Auto-advance and
 * narration both stop with the shared demo pause. An optional AI box answers
 * questions about the current mesh step.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOUR_STEPS } from '../../tour/steps'
import { api } from '../../api/client'
import { useA11yPrefs, usePrefersReducedMotion } from '../../hooks/useA11yPrefs'
import { useDemoPaused } from '../../hooks/useDemoPause'

/** Whether this browser can read captions aloud. */
const SPEECH_OK = typeof window !== 'undefined' && 'speechSynthesis' in window
/** How long to wait for a step's highlight target to appear on the new page. */
const TARGET_WAIT_MS = 6000

/**
 * Guided demo. A non-modal panel (the page stays usable) that walks through
 * TOUR_STEPS: navigate → run the step's action → highlight its target → show
 * the caption. Keyboard and screen-reader friendly: captions are announced,
 * focus moves to the caption only when the user advanced it, Esc exits.
 * Auto-advance can be paused at any time (WCAG 2.2.1 / 2.2.2); captions can be
 * read aloud at the user's preferred speaking rate.
 * @param {{open: boolean, onClose: () => void, steps?: object[], label?: string,
 *   onEnd?: () => void, storyId?: string}} props `onEnd` runs on Finish/Exit (stories reset the mesh)
 */
export default function GuidedTour({ open, onClose, steps = TOUR_STEPS, label = 'Guided demo', onEnd, storyId }) {
  const navigate = useNavigate()
  const [prefs] = useA11yPrefs()
  const reducedMotion = usePrefersReducedMotion()
  const demoPaused = useDemoPaused()
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
  const carry = useRef(null)
  // "Ask about this step": AI answers from the live mesh state (offered only when configured).
  const [aiReady, setAiReady] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')
  useEffect(() => { if (open) api.aiStatus().then(r => setAiReady(!!r.configured)).catch(() => {}) }, [open])
  useEffect(() => { setAnswer(null); setAskError(''); setQuestion('') }, [index])
  /** Send the question about the current step to the AI and show its answer. */
  const ask = async (e) => {
    e.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setAskError(''); setAnswer(null)
    try {
      const r = await api.meshAsk({ question, story: storyId || null, step_title: step.title, step_caption: step.body.join(' ') })
      setAnswer(r.answer)
    } catch (err) { setAskError(err.message) } finally { setAsking(false) }
  }
  const step = steps[index]
  const last = index === steps.length - 1

  /** Remove the highlight from the previous step's target. */
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
        // Keep the caption off the highlighted area: sit on the side away from it, or —
        // for full-width areas — scroll the area to the top, leaving room below for the caption.
        const wide = el.getBoundingClientRect().width > window.innerWidth * 0.6
        el.style.scrollMarginTop = wide ? '72px' : ''
        el.scrollIntoView({ block: wide ? 'start' : 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
        // Decide once scrolling has settled (it may not reach the top near the page end).
        await new Promise(r => setTimeout(r, reducedMotion ? 50 : 450))
        if (id !== runId.current) return
        const r = el.getBoundingClientRect()
        setSide(wide ? (r.top > window.innerHeight * 0.4 ? 'top' : 'right')
          : r.left + r.width / 2 > window.innerWidth * 0.6 ? 'left' : 'right')
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
    if (demoPaused) return                  // demo paused: hold the countdown where it is
    // Continue a countdown interrupted by a pause; otherwise start this step's.
    let left = carry.current?.index === index && carry.current.left > 0 ? carry.current.left : step.seconds
    setRemaining(left)
    const t = setInterval(() => {
      left -= 1
      setRemaining(left)
      if (left <= 0) {
        clearInterval(t)
        focusOnChange.current = false        // don't yank focus during hands-off playback
        setIndex(i => Math.min(i + 1, steps.length - 1))
      }
    }, 1000)
    return () => { clearInterval(t); carry.current = { index, left } }
  }, [open, auto, busy, index, demoPaused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pause narration with the demo.
  useEffect(() => {
    if (!SPEECH_OK) return
    if (demoPaused) window.speechSynthesis.pause()
    else window.speechSynthesis.resume()
  }, [demoPaused])

  /** Move `delta` steps (user action): focus follows the caption and any held countdown is dropped. */
  const go = useCallback((delta) => {
    focusOnChange.current = true
    carry.current = null
    setIndex(i => Math.max(0, Math.min(steps.length - 1, i + delta)))
  }, [steps.length])

  /** Leave the tour: stop pending work and speech, rewind, then onEnd and onClose. */
  const exit = useCallback(() => {
    runId.current++
    clearHighlight()
    if (SPEECH_OK) window.speechSynthesis.cancel()
    setAuto(false)
    setIndex(0)
    onEnd?.()
    onClose()
  }, [onClose, onEnd])

  useEffect(() => { if (!open) clearHighlight() }, [open])
  useEffect(() => () => { clearHighlight(); if (SPEECH_OK) window.speechSynthesis.cancel() }, [])

  if (!open) return null
  return (
    <section className={`tour-panel ${side} ${minimised ? 'min' : ''}`} role="dialog" aria-modal="false" aria-labelledby="tour-h"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); exit() } }}>
      <div className="tour-top">
        <span className="tour-count">{label} · step {index + 1} of {steps.length}</span>
        <button type="button" className="tour-icon-btn" onClick={() => setMinimised(m => !m)} aria-expanded={!minimised}
          aria-label={minimised ? 'Show tour caption' : 'Minimise tour caption'}>{minimised ? '▴' : '▾'}</button>
      </div>
      <div className="tour-progress" role="progressbar" aria-label={`${label} progress`} aria-valuemin={1}
        aria-valuemax={steps.length} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <h2 id="tour-h" tabIndex={-1} ref={headingRef}>{step.title}</h2>
      {!minimised && (
        <div className="tour-body" aria-live={focusOnChange.current ? 'off' : 'polite'}>
          {step.body.map((p, i) => <p key={i}>{p}</p>)}
          {busy && <p className="tour-dim" role="status">Setting up this step…</p>}
          {note && <p className="tour-warn" role="alert">{note}</p>}
        </div>
      )}
      {!minimised && aiReady && step.path === '/mesh' && (
        <details className="tour-ask" onToggle={e => { if (e.currentTarget.open) setAuto(false) }}>
          <summary>Ask about this step (AI)</summary>
          <form onSubmit={ask} className="tour-ask-form">
            <label htmlFor="tour-ask-q" className="sr-only">Your question about this step</label>
            <input id="tour-ask-q" type="text" value={question} maxLength={500} placeholder="e.g. Why did VISTA disagree?"
              onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.stopPropagation()} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={asking || !question.trim()}>{asking ? 'Asking…' : 'Ask'}</button>
          </form>
          <div aria-live="polite" className="tour-ask-out" tabIndex={answer ? 0 : undefined}
            role={answer ? 'region' : undefined} aria-label={answer ? 'AI answer' : undefined}>
            {asking && <p className="tour-dim">Looking at the live mesh…</p>}
            {answer && <p className="tour-answer"><span className="tour-dim">AI answer, from the live simulation: </span>{answer}</p>}
            {askError && <p className="tour-warn">{askError}</p>}
          </div>
        </details>
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
        <button type="button" className="btn btn-sm tour-exit" onClick={exit} aria-label={`Exit ${label.toLowerCase()}`}>Exit</button>
      </div>
    </section>
  )
}
