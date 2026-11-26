/**
 * Self-guided demos for the audience's phones (part of the /live companion app).
 *
 * What: three small interactive demos that mirror the talk — the journey of a CORSIA
 * credit (with the authorisation bottleneck), "check a claim" (pick A, B or C and watch
 * the state's checks run), and the Hurricane Dorian replay over illustrative blue-carbon
 * projects — plus the room's revealed poll results.
 * Why: the QR code on the slides leads to one place that works during the talk (voting)
 * and afterwards (exploring), on any phone, with no account.
 * How: content comes from paris-deck.json (`companion`), the same file as the slides; the
 * replay loads the public, cached GET /api/hurricane/coastal-replay once and draws a
 * light SVG map (no map library) with a time slider. Icons are Lucide, each with a title.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ClipboardCheck, Database, FileSignature, Landmark, Pause, Play, Plane, Sprout, X,
} from 'lucide-react'
import deck from './paris-deck.json'
import { ApiError } from '../api/errors'

const C = deck.companion
/** Icons the journey may name. */
const ICONS = { Sprout, ClipboardCheck, Database, FileSignature, Landmark, Plane }

/** A titled, decorative icon (a visible label always sits beside it). */
function Icon({ as: Comp, title, ...props }) {
  return Comp ? <Comp aria-hidden="true" focusable="false" {...props}><title>{title}</title></Comp> : null
}

/** The journey of one credit: tap through the steps; the authorisation step is the bottleneck. */
export function Journey() {
  const [step, setStep] = useState(0)
  const s = C.journey[step]
  return (
    <section className="cx" aria-labelledby="cx-journey">
      <h2 id="cx-journey">How a credit reaches an airline</h2>
      <ol className="cx-steps">
        {C.journey.map((j, i) => (
          <li key={j.label}>
            <button type="button" className={`cx-step${i === step ? ' on' : ''}${j.stall ? ' stall' : ''}${i < step ? ' done' : ''}`}
              onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${j.label}`}>
              <Icon as={ICONS[j.icon]} title={j.label} />
            </button>
            <span className="cx-step-lbl">{j.label}</span>
          </li>
        ))}
      </ol>
      <div className={`cx-card${s.stall ? ' stall' : ''}`} aria-live="polite">
        <b>{step + 1}. {s.label}</b>
        <p>{s.text}</p>
        {s.bahamas && <p className="cx-flag">{s.bahamas}</p>}
      </div>
      <div className="cx-row">
        <button type="button" className="cx-btn" onClick={() => setStep(v => Math.max(0, v - 1))} disabled={step === 0}>Back</button>
        <button type="button" className="cx-btn primary" onClick={() => setStep(v => Math.min(C.journey.length - 1, v + 1))}
          disabled={step === C.journey.length - 1}>Next step</button>
      </div>
    </section>
  )
}

/** Pick a claim and watch the five checks run one by one, ending in the verdict. */
export function ClaimCheck() {
  const [id, setId] = useState(null)
  const [shown, setShown] = useState(0)
  const timer = useRef(null)
  useEffect(() => () => clearInterval(timer.current), [])

  /** Start the checks for claim `k`, revealing one result every 0.7 s. */
  const run = (k) => {
    clearInterval(timer.current)
    setId(k); setShown(0)
    let n = 0
    timer.current = setInterval(() => { n += 1; setShown(n); if (n > C.checks.length) clearInterval(timer.current) }, 700)
  }
  const res = id && C.claimResults[id]
  const claim = id && deck.claims[id]
  return (
    <section className="cx" aria-labelledby="cx-check">
      <h2 id="cx-check">Check a claim</h2>
      <div className="cx-row" role="group" aria-label="Choose a claim">
        {['A', 'B', 'C'].map(k => (
          <button key={k} type="button" className={`cx-claim${id === k ? ' on' : ''}`} onClick={() => run(k)} aria-pressed={id === k}>
            <b>{k}</b><span>{deck.claims[k].units} · {deck.claims[k].registry}</span>
          </button>
        ))}
      </div>
      {!id && <p className="cx-dim">Tap a claim to run the checks the state performs.</p>}
      {id && (
        <>
          <p className="cx-dim">{claim.airline} · {claim.units} units · {claim.registry} · vintage {claim.vintage}</p>
          <ul className="cx-checks" aria-live="polite">
            {C.checks.map((label, i) => (
              <li key={label} className={i < shown ? (res.results[i] ? 'ok' : 'bad') : 'wait'}>
                {i < shown
                  ? (res.results[i] ? <Icon as={Check} title="Passed" /> : <Icon as={X} title="Failed" />)
                  : <span className="cx-spin" aria-hidden="true" />}
                <span>{label}<span className="sr-only">{i < shown ? (res.results[i] ? ': passed' : ': failed') : ': checking'}</span></span>
              </li>
            ))}
          </ul>
          {shown > C.checks.length - 1 && (
            <div className={`cx-verdict ${res.tone}`} role="status"><b>{res.verdict}</b><span>{res.why}</span></div>
          )}
        </>
      )}
    </section>
  )
}

/** Map bounds for the replay's mini map (lat/lon) and the SVG it is drawn into. */
const BOX = { lat0: 24.2, lat1: 27.8, lon0: -79.6, lon1: -74.6, w: 360, h: 260 }
/** Project a lat/lon onto the mini-map SVG. */
const xy = ([lat, lon]) => [((lon - BOX.lon0) / (BOX.lon1 - BOX.lon0)) * BOX.w, ((BOX.lat1 - lat) / (BOX.lat1 - BOX.lat0)) * BOX.h]

/** Hurricane Dorian replayed hour by hour: track, wind field and each project's exposure. */
export function DorianReplay() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [h, setH] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    fetch('/api/hurricane/coastal-replay')
      .then(r => { if (!r.ok) throw new ApiError(`Replay unavailable (${r.status})`, r.status); return r.json() })
      .then(d => { setData(d); setH(Math.max(0, d.steps.findIndex(s => s.local.startsWith('Sun 01 Sep')) - 6)) })
      .catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    if (!playing || !data) return undefined
    const t = setInterval(() => setH(v => { if (v + 1 >= data.steps.length) { setPlaying(false); return v } return v + 1 }), 250)
    return () => clearInterval(t)
  }, [playing, data])
  const track = useMemo(() => (data ? data.steps.map(s => xy([s.lat, s.lon]).join(',')).join(' ') : ''), [data])
  if (error) return <section className="cx"><h2>Dorian, 2019</h2><p role="alert" className="cx-dim">{error}</p></section>
  if (!data) return <section className="cx"><h2>Dorian, 2019</h2><p className="cx-dim">Loading the storm…</p></section>
  const s = data.steps[h]
  const field34 = s.field?.['34'] || []
  const field64 = s.field?.['64'] || []
  const [px, py] = xy([s.lat, s.lon])
  return (
    <section className="cx" aria-labelledby="cx-dorian">
      <h2 id="cx-dorian">Dorian, 2019</h2>
      <p className="cx-dim">{s.local} · {s.category ? `Category ${s.category}` : 'Tropical storm'} · {s.vmax_kt} kt</p>
      <svg className="cx-map" viewBox={`0 0 ${BOX.w} ${BOX.h}`} preserveAspectRatio="xMidYMid slice" role="img"
        aria-label={`Storm position ${s.local}: category ${s.category}, ${s.vmax_kt} knots. ${data.portfolio.peak_pct_hurricane}% of the portfolio peaked under hurricane-force winds.`}>
        <defs><clipPath id="cx-clip"><rect width={BOX.w} height={BOX.h} /></clipPath></defs>
        <g clipPath="url(#cx-clip)">
        <polyline points={track} className="trk" />
        {field34.length > 0 && <polygon points={field34.map(p => xy(p).join(',')).join(' ')} className="f34" />}
        {field64.length > 0 && <polygon points={field64.map(p => xy(p).join(',')).join(' ')} className="f64" />}
        {data.projects.map(p => <polygon key={p.id} points={p.outline.map(q => xy(q).join(',')).join(' ')} className="prj" />)}
        <circle cx={px} cy={py} r="5" className="eye" />
        </g>
      </svg>
      <label className="cx-slider">
        <span className="sr-only">Storm hour</span>
        <input type="range" min="0" max={data.steps.length - 1} value={h} aria-valuetext={`${s.local}, ${s.category ? `category ${s.category}` : 'tropical storm'}`} onChange={e => { setPlaying(false); setH(Number(e.target.value)) }} />
      </label>
      <div className="cx-row">
        <button type="button" className="cx-btn primary" onClick={() => setPlaying(v => !v)} aria-pressed={playing}>
          {playing ? <Icon as={Pause} title="Pause" /> : <Icon as={Play} title="Play" />}{playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <ul className="cx-exp">
        {data.projects.map(p => {
          const e = s.exposure?.[p.id] || { share: { 64: 0 }, hours_hurricane: 0 }
          return (
            <li key={p.id}>
              <span className="nm">{p.name}</span>
              <span className="bar" role="img" aria-label={`${Math.round(e.share['64'] || 0)}% under hurricane-force winds`}>
                <span style={{ width: `${e.share['64'] || 0}%` }} />
              </span>
              <span className="hrs">{e.hours_hurricane} h</span>
            </li>
          )
        })}
      </ul>
      <p className="cx-dim">Bar: share of each area under hurricane-force winds now · hours so far. Same storm, very different exposure.</p>
    </section>
  )
}

/** The room's answers for every question the presenter has revealed. */
export function RoomResults({ results }) {
  const list = Object.values(results)
  if (!list.length) return <section className="cx"><h2>Room results</h2><p className="cx-dim">Results appear here as each question is revealed.</p></section>
  return (
    <section className="cx" aria-labelledby="cx-room">
      <h2 id="cx-room">Room results</h2>
      {list.map(r => (
        <div key={r.poll} className="cx-result">
          <b>{r.question}</b>
          {r.options.map(o => {
            const pct = r.total ? Math.round((100 * (r.counts[o.id] || 0)) / r.total) : 0
            return (
              <div key={o.id} className={`cx-rrow${r.answer === o.id ? ' answer' : ''}`}>
                <span className="fill" style={{ width: `${pct}%` }} /><span className="t">{o.label}{r.answer === o.id ? ' ✓ (answer)' : ''}</span><b>{pct}%</b>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

/** Footnote shown under the demos. */
export const NOTE = C.note
