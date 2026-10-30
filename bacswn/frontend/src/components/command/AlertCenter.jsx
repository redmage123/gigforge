import { useEffect, useRef, useState } from 'react'

const SEVERITY_LABEL = { severe: 'SEVERE', high: 'HIGH', moderate: 'MODERATE', low: 'ADVISORY' }
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** Short two-tone chime; resumes the AudioContext (browsers suspend it until a user gesture). */
export function useChime() {
  const ctxRef = useRef(null)
  useEffect(() => {
    // Unlock audio on the first interaction so later alerts can sound.
    const unlock = () => {
      try {
        if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        ctxRef.current.resume?.()
      } catch { /* no audio */ }
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])
  return () => {
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      ;[[880, 0], [660, 0.18]].forEach(([freq, at]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.15, ctx.currentTime + at)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.35)
        osc.start(ctx.currentTime + at)
        osc.stop(ctx.currentTime + at + 0.35)
      })
    } catch { /* audio not available — the visual banner still shows */ }
  }
}

/**
 * Operational alerts with equivalent visual, text and screen-reader output — the
 * optional chime is never the only signal (WCAG 1.1.1 / hearing impairment).
 * alerts: [{id, title, detail, severity, time: Date, source}] newest first.
 */
export default function AlertCenter({ alerts, onDismiss, onDismissAll, prefs, setPref }) {
  const [showLog, setShowLog] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [flashId, setFlashId] = useState(null)
  const seen = useRef(new Set())
  const active = alerts.filter(a => !a.dismissed)

  useEffect(() => {
    const fresh = alerts.find(a => !seen.current.has(a.id))
    alerts.forEach(a => seen.current.add(a.id))
    if (!fresh) return
    setAnnouncement(`${SEVERITY_LABEL[fresh.severity] || 'ALERT'}: ${fresh.title}. ${fresh.detail}`)
    if (prefs.alertFlash) {
      setFlashId(fresh.id)
      const t = setTimeout(() => setFlashId(null), 1200)
      return () => clearTimeout(t)
    }
  }, [alerts, prefs.alertFlash])

  return (
    <section className="alert-center" aria-labelledby="alert-center-h">
      <div className="sr-only" role="alert" aria-live="assertive">{announcement}</div>
      <div className="alert-center-bar">
        <h3 id="alert-center-h">
          <span aria-hidden="true">⚠ </span>Operational alerts
          <span className="alert-count">{active.length ? `${active.length} active` : 'none active'}</span>
        </h3>
        <div className="alert-controls">
          <button type="button" className="toggle-btn" aria-pressed={prefs.alertSound}
            onClick={() => setPref('alertSound', !prefs.alertSound)}
            title="Play a chime when a new alert arrives. Alerts are always shown on screen and announced to screen readers.">
            <span aria-hidden="true">{prefs.alertSound ? '🔔' : '🔕'}</span> Sound {prefs.alertSound ? 'on' : 'off'}
          </button>
          <button type="button" className="toggle-btn" aria-pressed={prefs.alertFlash}
            onClick={() => setPref('alertFlash', !prefs.alertFlash)}
            title="Briefly highlight new alerts (a single pulse, safe for photosensitivity).">
            <span aria-hidden="true">✦</span> Visual pulse {prefs.alertFlash ? 'on' : 'off'}
          </button>
          <button type="button" className="toggle-btn" aria-expanded={showLog} aria-controls="alert-log"
            onClick={() => setShowLog(v => !v)}>
            History ({alerts.length})
          </button>
          {active.length > 1 && <button type="button" className="toggle-btn" onClick={onDismissAll}>Dismiss all</button>}
        </div>
      </div>

      {active.length > 0 && (
        <ul className="alert-list" aria-label="Active alerts">
          {active.slice(0, 3).map(a => (
            <li key={a.id} className={`alert-banner sev-${a.severity} ${flashId === a.id ? 'alert-pulse' : ''}`}>
              <span className="alert-sev">{SEVERITY_LABEL[a.severity] || 'ALERT'}</span>
              <div className="alert-text">
                <strong>{a.title}</strong>
                <span>{a.detail}</span>
              </div>
              <time dateTime={a.time.toISOString()}>{fmtTime(a.time)}</time>
              <button type="button" className="alert-dismiss" aria-label={`Dismiss alert: ${a.title}`} onClick={() => onDismiss(a.id)}>✕</button>
            </li>
          ))}
          {active.length > 3 && <li className="alert-more">+{active.length - 3} more in history</li>}
        </ul>
      )}

      {showLog && (
        <div id="alert-log" className="alert-log">
          {alerts.length === 0 ? <p>No alerts received this session.</p> : (
            <table className="data-table">
              <caption className="sr-only">Alerts received this session, newest first</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Severity</th><th scope="col">Alert</th><th scope="col">Source</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td>{fmtTime(a.time)}</td>
                    <td>{SEVERITY_LABEL[a.severity] || 'ALERT'}</td>
                    <td><strong>{a.title}</strong> — {a.detail}</td>
                    <td>{a.source}</td>
                    <td>{a.dismissed ? 'Dismissed' : 'Active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}
