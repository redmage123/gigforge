/**
 * The Command Center weather briefing: buildBriefing (the text) and
 * BriefingPanel (transcript with optional read-aloud and live captions).
 *
 * Why: the spoken briefing must also work for deaf and hard-of-hearing users
 * and in browsers without speech synthesis, so the text is always on screen.
 * How: the briefing is a list of caption lines; speech queues one utterance per
 * line and highlights the line being spoken.
 */
import { useEffect, useRef, useState } from 'react'

/** Whether this browser can read the briefing aloud. */
const SPEECH_OK = typeof window !== 'undefined' && 'speechSynthesis' in window
/** Speaking-rate choices: [rate, label]. */
const RATES = [[0.75, 'Slow'], [0.9, 'Normal'], [1.1, 'Fast'], [1.3, 'Faster']]

/** Spoken form of a caption line: spell out aviation abbreviations for the synthesiser. */
const toSpeech = (s) => s.replace(/\bVFR\b/g, 'V F R').replace(/\bMVFR\b/g, 'marginal V F R')
  .replace(/\bIFR\b/g, 'I F R').replace(/\bLIFR\b/g, 'low I F R').replace(/\bFIR\b/g, 'F I R')

/**
 * Build the briefing as caption lines (display text).
 * Only METAR stations count as reporting; model-estimated stations are stated as estimates.
 * @param {object} summary dashboard summary (`command_center` counts), may be null
 * @param {object[]} flights aircraft in the FIR
 * @param {object[]} stations weather stations with `source` and `flight_category`
 * @returns {string[]}
 */
export function buildBriefing(summary, flights, stations) {
  const hour = new Date().getUTCHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const flightCount = summary?.command_center?.active_flights ?? flights.length
  const alertCount = summary?.command_center?.active_alerts ?? 0
  // Only METAR observations count as "reporting"; model nowcasts are stated as estimates.
  const observed = stations.filter(s => s.source === 'metar')
  const estimated = stations.filter(s => s.source === 'model')
  const isIfr = (s) => s.flight_category === 'IFR' || s.flight_category === 'LIFR'
  const vfr = observed.filter(s => s.flight_category === 'VFR').length
  const ifr = observed.filter(isIfr)
  const estIfr = estimated.filter(isIfr)
  const lines = [
    `${greeting}. This is your Bahamas FIR automated weather briefing.`,
    `${flightCount} aircraft are currently tracked in the airspace.`,
    `${observed.length} of ${stations.length || 15} weather stations are reporting observations.`,
  ]
  if (estimated.length > 0) lines.push(`${estimated.length} stations without a current report are shown from model estimates.`)
  if (vfr > 0) lines.push(`${vfr} reporting station${vfr > 1 ? 's' : ''} observe VFR conditions.`)
  if (ifr.length > 0) lines.push(`${ifr.length} reporting station${ifr.length > 1 ? 's' : ''} observe IFR or lower: ${ifr.map(s => s.icao).join(', ')}. Caution advised.`)
  if (estIfr.length > 0) lines.push(`Model estimates suggest IFR or lower at ${estIfr.map(s => s.icao).join(', ')}; not confirmed by observation.`)
  lines.push(alertCount > 0 ? `${alertCount} active weather advisories are in effect.` : 'No significant weather advisories at this time.')
  lines.push('End of briefing.')
  return lines
}

/**
 * Weather briefing with a full transcript and live captions. Speech is optional:
 * the text is always shown, so the briefing works for deaf/hard-of-hearing users
 * and in browsers without speech synthesis. The current sentence is highlighted
 * while speaking.
 * @param {{lines: string[], open: boolean, onClose: () => void, autoSpeak?: boolean,
 *   rate: number, onRate: (rate: number) => void}} props
 */
export default function BriefingPanel({ lines, open, onClose, autoSpeak, rate, onRate }) {
  const [current, setCurrent] = useState(-1)
  const [speaking, setSpeaking] = useState(false)
  const headingRef = useRef(null)
  const runRef = useRef(0)

  /** Stop speaking and clear the highlight; invalidates callbacks from the old run. */
  const stop = () => {
    runRef.current++
    if (SPEECH_OK) window.speechSynthesis.cancel()
    setSpeaking(false)
    setCurrent(-1)
  }

  /** Read every line aloud from the start, highlighting each as it is spoken. */
  const speak = () => {
    if (!SPEECH_OK) return
    stop()
    const run = ++runRef.current
    setSpeaking(true)
    lines.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(toSpeech(line))
      u.rate = rate
      u.onstart = () => { if (runRef.current === run) setCurrent(i) }
      if (i === lines.length - 1) u.onend = u.onerror = () => { if (runRef.current === run) { setSpeaking(false); setCurrent(-1) } }
      window.speechSynthesis.speak(u)
    })
  }

  useEffect(() => {
    if (!open) { stop(); return }
    headingRef.current?.focus()
    if (autoSpeak) speak()
    return stop
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  return (
    <section className="briefing-panel" aria-labelledby="briefing-h">
      <div className="briefing-head">
        <h3 id="briefing-h" tabIndex={-1} ref={headingRef}>Weather briefing — transcript</h3>
        <div className="briefing-controls">
          {SPEECH_OK ? (
            <>
              <button type="button" className="toggle-btn" onClick={speaking ? stop : speak} aria-pressed={speaking}>
                <span aria-hidden="true">{speaking ? '⏹' : '▶'}</span> {speaking ? 'Stop reading' : 'Read aloud'}
              </button>
              <label className="briefing-rate">
                Speed
                <select value={rate} onChange={e => onRate(Number(e.target.value))}>
                  {RATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </>
          ) : <span className="briefing-note">Read-aloud isn’t available in this browser — the full text is below.</span>}
          <button type="button" className="toggle-btn" onClick={onClose}>Close</button>
        </div>
      </div>
      <ol className="briefing-lines">
        {lines.map((l, i) => (
          <li key={i} className={i === current ? 'speaking' : ''} aria-current={i === current ? 'true' : undefined}>{l}</li>
        ))}
      </ol>
    </section>
  )
}
