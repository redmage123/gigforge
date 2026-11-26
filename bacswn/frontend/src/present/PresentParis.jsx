/**
 * Paris carbon-markets talk: interactive presenter deck.
 *
 * What: a full-screen, near text-free slide deck for Mike's 20-minute talk. Slides are
 * animations (growing bars, verdict stamps, a flat-lining weather station, a hub), live
 * audience polls, and buttons that open the real BACSWN screens in a full-screen frame.
 * Why: the talk must be interactive and visual rather than "one more PowerPoint"; the
 * words live in the speaker notes (press N), not on the slides.
 * How: slide content comes from paris-deck.json (shared with the PPTX/PDF export script).
 * Each slide is drawn on a fixed 1920×1080 stage scaled to the window, so every pixel
 * lines up the same on any screen. Entering a slide steers the audience phones through
 * /api/live-admin/control (opens a poll, reveals answers, or closes voting); poll-driven
 * slides refresh counts every 1.5 s.
 * Keys: → / Space next, ← back, N notes, F full screen, Esc closes a live demo.
 * `?static=1&slide=N` renders one slide's final frame without chrome (for export);
 * `?export=1` keeps the animations but hides the presenter chrome and every audience count
 * (for the recorded PPTX and the PDF handout, which run without live polls).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import deck from './paris-deck.json'
import qrUrl from './qr-live.svg'
import {
  Ban, BadgeCheck, Check, ChevronLeft, ChevronRight, ClipboardCheck, Coins, CopyX, Database, FileCheck2,
  FileSignature, Hourglass, Landmark, MapPin, MonitorPlay, Pause, Play, Plane, RadioTower, Scale, SearchCheck,
  ShieldCheck, Smartphone, Sprout, TrendingUp, Waves, Wind,
} from 'lucide-react'
import { api } from '../api/client'
import '@fontsource-variable/inter'
import './present.css'

/** Query-string flags: static export mode and the starting slide. */
const PARAMS = new URLSearchParams(window.location.search)
const STATIC = PARAMS.get('static') === '1'
/** Export mode (PPTX/PDF): no chrome, no audience counts, no poll steering. */
const EXPORT = STATIC || PARAMS.get('export') === '1'
/** Read-only: no admin calls and no presenter controls (exports). */
const READ_ONLY = EXPORT
const START = Math.max(0, Math.min(deck.slides.length - 1, Number(PARAMS.get('slide') || window.location.hash.slice(1) || 0) || 0))
/** Stage size every slide is designed for. */
const STAGE_W = 1920
const STAGE_H = 1080

/** Inline style that delays an element's entrance animation by `i` steps of `step` seconds. */
const delay = (i, step = 0.25, base = 0) => ({ animationDelay: `${base + i * step}s` })

/**
 * Speaking pace for builds: seconds between successive reveals, chosen so each item
 * appears as the presenter would name it (about one short phrase, ~140 words a minute).
 */
const BEAT = { tile: 0.3, card: 0.6, bar: 3, stamp: 3, step: 2, hop: 1, rest: 0.6, spoke: 2.5, trace: 2 }

/** Percent of `n` in `total`, rounded; 0 when nobody has voted. */
const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0)

/** Lucide icons the deck JSON may name (keeps the JSON free of code). */
const ICONS = {
  Ban, BadgeCheck, ClipboardCheck, CopyX, Database, FileCheck2, FileSignature, Hourglass, Landmark, MapPin, Plane,
  RadioTower, Scale, SearchCheck, ShieldCheck, Sprout, TrendingUp, Waves, Wind,
}

/**
 * A named Lucide icon with a title (shown as a tooltip). It stays hidden from screen
 * readers because a visible label always sits next to it and carries the meaning.
 */
function Icon({ name, title, ...props }) {
  const C = ICONS[name]
  return C ? <C aria-hidden="true" focusable="false" {...props}><title>{title || name}</title></C> : null
}

/** Short on-screen label for a poll option (phones show the full label). */
const short = (o) => o.short || o.label

/** The poll control a slide implies when it is shown: open a poll, reveal one, or close voting. */
function controlFor(slide) {
  if (slide.kind === 'poll' || slide.kind === 'hub') return { active: slide.poll }
  if (slide.kind === 'compare') return { active: slide.poll, reveal: slide.compareWith }
  if (slide.reveal) return { active: null, reveal: slide.poll }
  return { active: null }
}

/** Live poll results for the presenter, refreshed while a poll-driven slide is showing. */
function usePolls(live) {
  const [polls, setPolls] = useState({})
  useEffect(() => {
    let stop = false
    /** Fetch every poll's counts (admin view) into a map by id. */
    const load = () => api.get('/api/live-admin/polls')
      .then(r => { if (!stop) setPolls(Object.fromEntries(r.polls.map(p => [p.id, p]))) })
      .catch(() => {})
    load()
    const t = live && !STATIC ? setInterval(load, 1500) : null
    return () => { stop = true; if (t) clearInterval(t) }
  }, [live])
  return polls
}

/** Scale factor that fits the 1920×1080 stage inside the window (letterboxed). */
function useStageScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    /** Recompute on resize and full-screen changes. */
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return scale
}

/** Opening/closing slide: drifting flight arcs, title, and the QR code to join the polls. */
function TitleSlide({ slide, showJoin }) {
  return (
    <>
      <svg className="pd-arcs" viewBox="0 0 1920 1080" aria-hidden="true">
        {[...Array(9)].map((_, i) => (
          <path key={i} d={`M ${-120 + i * 48} ${980 - i * 70} Q 960 ${-240 + i * 84} ${2040 - i * 36} ${360 + i * 66}`} />
        ))}
      </svg>
      <h1 className="pd-title" style={showJoin ? undefined : { top: 390 }}>{slide.headline}</h1>
      <p className="pd-sub" style={showJoin ? undefined : { top: 560 }}>{slide.sub}</p>
      {showJoin && (
        <div className="pd-join">
          <img src={qrUrl} alt={`QR code: ${deck.joinUrl}`} />
          <span><Smartphone aria-hidden="true" className="pd-ic-inline" strokeWidth={2.25}><title>Join on your phone</title></Smartphone>{deck.joinUrl}</span>
        </div>
      )}
      <p className="pd-meta">{deck.speaker} · {deck.event}</p>
    </>
  )
}

/** Footer counting phone responses, with the join address. */
function Responses({ poll, join = true }) {
  if (READ_ONLY) return join ? <div className="pd-foot"><Smartphone aria-hidden="true" className="pd-ic-inline"><title>Join on your phone</title></Smartphone>{deck.joinUrl}</div> : null
  return (
    <div className="pd-foot" aria-live="polite">
      <Smartphone aria-hidden="true" className="pd-ic-inline"><title>Responses from phones</title></Smartphone><span className="n">{poll?.total ?? 0}</span> responses{join ? ` · ${deck.joinUrl}` : ''}
    </div>
  )
}

/** One claim card: letter and four short facts (airline, units, registry, vintage). */
function ClaimCard({ id, index, children }) {
  const c = deck.claims[id]
  return (
    <div className="pd-card" style={delay(index, BEAT.card)}>
      <div className="letter">{id}</div>
      <div className="row"><b>{c.airline}</b></div>
      <div className="row">{c.units} units</div>
      <div className="row">{c.registry}</div>
      <div className="row">Vintage {c.vintage}</div>
      {children}
    </div>
  )
}

/** A question on every phone; the screen shows short option tiles (or claim cards) and a counter. */
function PollSlide({ slide, poll }) {
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      {slide.display === 'cards' ? (
        <div className="pd-cards">{['A', 'B', 'C'].map((id, i) => <ClaimCard key={id} id={id} index={i} />)}</div>
      ) : (
        <div className="pd-tiles" role="list">
          {(poll?.options || []).map((o, i) => <div key={o.id} role="listitem" className="pd-tile" style={delay(i, BEAT.tile)}>{short(o)}</div>)}
        </div>
      )}
      <Responses poll={poll} />
    </>
  )
}

/** Authorised vs needed units as two growing bars, the deadline, and the room's guess. */
function GapSlide({ slide, poll }) {
  const max = Math.max(...slide.bars.map(b => b.value))
  const days = Math.max(0, Math.ceil((new Date(slide.deadline) - new Date()) / 86400000))
  const top = poll?.total ? poll.options.reduce((a, o) => ((poll.counts[o.id] || 0) > (poll.counts[a.id] || 0) ? o : a), poll.options[0]) : null
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      <div className="pd-gap">
        {slide.bars.map((b, i) => (
          <div key={b.label}>
            <div className="name">{b.label}</div>
            <div className={`bar ${b.tone}`} style={{ width: `${(100 * b.value) / max}%`, ...delay(i, BEAT.bar, 0.3) }}>{b.range || b.value}{b.unit}</div>
          </div>
        ))}
      </div>
      <p className="pd-deadline" style={delay(2, BEAT.bar, 0.3)}>{days.toLocaleString()} days to {new Date(slide.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      {top && !EXPORT && <p className="pd-guess" style={delay(2.5, BEAT.bar, 0.3)}>Room's top guess: {short(top)} ({pct(poll.counts[top.id], poll.total)}%)</p>}
      <span className="pd-source">{slide.source}</span>
    </>
  )
}

/** The three claims again; a verdict stamp slams onto each, with the room's vote share. */
function StampsSlide({ slide, poll }) {
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      <div className="pd-cards stamped">
        {slide.cards.map((c, i) => (
          <ClaimCard key={c.id} id={c.id} index={i}>
            <span className={`pd-stamp ${c.verdict}`} style={delay(i, BEAT.stamp, 2)}><Icon name={c.icon} title={c.stamp} className="pd-stamp-ic" strokeWidth={3} />{c.stamp}</span>
            {poll?.total > 0 && !EXPORT && <div className="pct">{pct(poll.counts[c.id] || 0, poll.total)}% of the room accepted</div>}
          </ClaimCard>
        ))}
      </div>
    </>
  )
}

/**
 * A process as an animation: icon steps pop in left to right, arrows draw between them,
 * then a credit token hops from step to step. In "stall" mode it stops at the bottleneck,
 * which pulses red; in "check" mode each step gets a tick as the token passes.
 * Geometry is fixed on the 1920×1080 stage; timings are derived from the step count.
 */
function FlowSlide({ slide, onOpenDemo }) {
  const steps = slide.steps
  const n = steps.length
  const R = 90, Y = 620, X0 = 230, X1 = 1690
  const xs = steps.map((_, i) => X0 + (i * (X1 - X0)) / (n - 1))
  const POP = BEAT.step, HOP = BEAT.hop, REST = BEAT.rest
  const tokenStart = 0.2 + POP * (n - 1) + 1.2
  const last = slide.mode === 'stall' ? slide.bottleneck : n - 1
  const arrive = (k) => tokenStart + k * (HOP + REST)
  const total = Math.max(0.01, arrive(last) - tokenStart)
  // Token keyframes: hop to each step, rest, hop on (percentages of the whole journey).
  const frames = [`0% { transform: translateX(${xs[0] - 40}px); }`]
  for (let k = 1; k <= last; k++) {
    const t0 = (arrive(k - 1) + REST - tokenStart) / total
    const t1 = (arrive(k) - tokenStart) / total
    frames.push(`${(Math.min(1, t0) * 100).toFixed(2)}% { transform: translateX(${xs[k - 1] - 40}px); }`)
    frames.push(`${(Math.min(1, t1) * 100).toFixed(2)}% { transform: translateX(${xs[k] - 40}px); }`)
  }
  const kf = `pd-tok-${slide.id}`
  return (
    <>
      <style>{`@keyframes ${kf} { ${frames.join(' ')} }`}</style>
      <h2 className="pd-h">{slide.headline}</h2>
      <svg className="pd-flow-arrows" viewBox="0 0 1920 1080" aria-hidden="true">
        <defs>
          <marker id={`ah-${slide.id}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M1,1 L11,6 L1,11 Z" fill="#64748b" />
          </marker>
        </defs>
        {xs.slice(0, -1).map((x, i) => (
          <line key={i} x1={x + R + 14} y1={Y} x2={xs[i + 1] - R - 18} y2={Y} markerEnd={`url(#ah-${slide.id})`}
            style={delay(i + 1, POP, -0.4)} />
        ))}
      </svg>
      <ol className="pd-flow" aria-label={steps.map(st => st.label).join(', then ')}>
        {steps.map((st, i) => {
          const stuck = slide.mode === 'stall' && i === slide.bottleneck
          return (
            <li key={st.label} className={`pd-step${stuck ? ' stuck' : ''}`} style={{ left: xs[i] - R, top: Y - R }}>
              <div className="node" style={stuck ? { animationDelay: `${0.2 + i * POP}s, ${arrive(i)}s` } : delay(i, POP, 0.2)}>
                <Icon name={st.icon} title={st.label} strokeWidth={1.75} />
                {stuck && <span className="ring" style={{ animationDelay: `${arrive(i)}s` }} />}
                {slide.mode === 'check' && <span className="tick" style={{ animationDelay: `${arrive(i)}s` }}><Check strokeWidth={4} aria-hidden="true"><title>Checked</title></Check></span>}
              </div>
              <div className="lbl" style={delay(i, POP, 0.35)}>{st.label}</div>
              {stuck && <div className="stall" style={{ animationDelay: `${arrive(i) + 0.2}s` }}>{slide.stallLabel}</div>}
            </li>
          )
        })}
      </ol>
      {slide.demo && !READ_ONLY && (
        <button type="button" className="pd-go-pill" onClick={onOpenDemo} aria-label={`Open live demo: ${slide.demo.label}`}>
          <MonitorPlay aria-hidden="true" strokeWidth={2.25}><title>Live demo</title></MonitorPlay>{slide.demo.label}
        </button>
      )}
      <div className="pd-token" aria-hidden="true"
        style={{ top: Y - R - 104, animation: `${kf} ${total}s ease-in-out ${tokenStart}s both, pd-fade .3s ${tokenStart - 0.3}s both` }}>
        <Coins strokeWidth={2.25}><title>One carbon credit</title></Coins>
        <span className="cap">1 credit</span>
      </div>
    </>
  )
}

/** Weather reports per day drawn like a heart monitor; the storm days flat-line in red. */
function FlatlineSlide({ slide }) {
  const s = slide.series
  const W = 1600, H = 640, left = 20, right = 20, top = 70, bottom = 70
  const step = (W - left - right) / (s.reports.length - 1)
  const y = v => H - bottom - (v / 24) * (H - top - bottom)
  const pts = s.reports.map((v, i) => [left + i * step, y(v)])
  const firstGap = s.reports.findIndex(v => v === 0) - 1
  const lastGap = s.reports.lastIndexOf(0) + 1
  const path = (from, to) => pts.slice(from, to + 1).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      <svg className="pd-ecg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${s.station} weather reports per day, ${s.days[0]} to ${s.days[s.days.length - 1]} 2019: ${s.gapLabel}`}>
        <line className="axis" x1={left} x2={W - right} y1={y(0)} y2={y(0)} />
        <RadioTower x={left} y={4} width={40} height={40} className="station-ic" aria-hidden="true"><title>Weather station</title></RadioTower>
        <text className="station" x={left + 54} y={34}>{s.station} · reports per day</text>
        <path className="trace" d={path(0, firstGap)} style={{ animationDelay: '0.4s', animationDuration: `${BEAT.trace}s` }} />
        <path className="trace flat" d={path(firstGap, lastGap)} style={{ animationDelay: `${0.4 + BEAT.trace}s`, animationDuration: `${BEAT.trace * 1.5}s` }} />
        <path className="trace" d={path(lastGap, pts.length - 1)} style={{ animationDelay: `${0.4 + BEAT.trace * 3}s`, animationDuration: `${BEAT.trace}s` }} />
        {s.days.map((d, i) => (i % 2 === 0 ? <text key={d} className="tick" x={left + i * step} y={H - 18} textAnchor="middle">{d}</text> : null))}
        <text className="gap-label" style={{ animationDelay: `${0.4 + BEAT.trace * 2.2}s` }} x={(pts[firstGap][0] + pts[lastGap][0]) / 2} y={y(0) - 40} textAnchor="middle">{s.gapLabel}</text>
      </svg>
      <span className="pd-source">{s.source}</span>
    </>
  )
}

/** Vertical bars for one poll on a fixed baseline, scaled so the tallest bar fills the track. */
function Columns({ poll, title, className }) {
  const total = poll?.total || 0
  const shares = (poll?.options || []).map(o => pct(poll.counts?.[o.id] || 0, total))
  const max = Math.max(1, ...shares)
  return (
    <div className={className}>
      <h3>{title} · {total}</h3>
      <div className="pd-cols">
        {(poll?.options || []).map((o, i) => (
          <div key={o.id} className="pd-col">
            <span className="v">{shares[i]}%</span>
            <div className="track"><div className="bar" style={{ height: `${(100 * shares[i]) / max}%` }} /></div>
            <span className="lbl">{short(o)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Buffer question before vs after the hurricane evidence, side by side. */
function CompareSlide({ slide, polls }) {
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      <div className="pd-compare">
        <Columns poll={polls[slide.compareWith]} title="Before" />
        <Columns poll={polls[slide.poll]} title="After" className="pd-after" />
      </div>
      <Responses poll={polls[slide.poll]} />
    </>
  )
}

/** Three problems pop in on a circle and lock onto one state-side platform; the room picks a start. */
function HubSlide({ slide, poll }) {
  const ids = ['supply', 'integrity', 'bluecarbon']
  // Spoke centres in the 800×660 hub box, core (220 px) centred at (400, 320).
  const centres = [[120, 100], [680, 100], [400, 560]]
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      <div className="pd-hub">
        <svg className="pd-hub-lines" viewBox="0 0 800 660" aria-hidden="true">
          {centres.map(([x, yy], i) => <line key={i} x1={x} y1={yy} x2={400} y2={320} style={delay(i, BEAT.spoke, 1)} />)}
        </svg>
        {slide.spokes.map((s, i) => (
          <div key={s.label} className="pd-spoke" style={{ left: centres[i][0] - 95, top: centres[i][1] - 95, ...delay(i, BEAT.spoke, 0.4) }}>
            <Icon name={s.icon} title={s.label} className="ic" strokeWidth={2} />
            <span>{s.label}</span>
            {poll?.total > 0 && !EXPORT && <span className="pct">{pct(poll.counts[ids[i]] || 0, poll.total)}%</span>}
          </div>
        ))}
        <div className="pd-core" style={delay(3, BEAT.spoke, 0)}>BACSWN</div>
      </div>
      <figure className="pd-revisit">
        <img src={qrUrl} alt={`QR code: ${deck.joinUrl}`} />
        <figcaption>Explore the demos on your phone</figcaption>
      </figure>
      <Responses poll={poll} join={false} />
    </>
  )
}

/** Render the right visual for a slide kind. */
function Slide({ slide, polls, onOpenDemo, index }) {
  const poll = polls[slide.poll]
  switch (slide.kind) {
    case 'title': return <TitleSlide slide={slide} showJoin={index === 0 || slide.id === 'thanks'} />
    case 'poll': return <PollSlide slide={slide} poll={poll} />
    case 'gap': return <GapSlide slide={slide} poll={poll} />
    case 'stamps': return <StampsSlide slide={slide} poll={poll} />
    case 'flatline': return <FlatlineSlide slide={slide} />
    // Without a live room (export) there is nothing to compare, so show the question instead.
    case 'compare': return EXPORT ? <PollSlide slide={slide} poll={poll} /> : <CompareSlide slide={slide} polls={polls} />
    case 'hub': return <HubSlide slide={slide} poll={poll} />
    case 'flow': return <FlowSlide slide={slide} onOpenDemo={onOpenDemo} />
    default: return <h2 className="pd-h">{slide.headline}</h2>
  }
}

/**
 * The presenter deck: stage scaling, navigation (on-slide buttons, keys, clicker), timed
 * auto-advance with pause, poll steering, notes, full screen and live-demo frames.
 *
 * Timing: in play mode each slide advances after its speaking time (`minutes` in the deck,
 * which add up to the 20-minute talk). Pause stops both the timer and every animation.
 * Opening a live demo pauses automatically, since its length depends on the presenter.
 */
export default function PresentParis() {
  const [index, setIndex] = useState(START)
  const [notes, setNotes] = useState(false)
  const [demo, setDemo] = useState(null)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  /** True only after Pause is pressed: holds the timer and freezes the slide's animations. */
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const rootRef = useRef(null)
  const scale = useStageScale()
  const slide = deck.slides[index]
  const duration = (slide.minutes || 1) * 60
  const polls = usePolls(['poll', 'compare', 'hub'].includes(slide.kind) || !!slide.poll)

  /** Move to slide `i` (clamped) and remember it in the URL hash so a reload resumes there. */
  const go = useCallback((i) => {
    const next = Math.max(0, Math.min(deck.slides.length - 1, i))
    setIndex(next)
    setElapsed(0)
    setPaused(false)
    setDemo(null)
    window.history.replaceState(null, '', `${window.location.search}#${next}`)
  }, [])

  /** Open a slide's live demo; the timer pauses while it is on screen. */
  const openDemo = useCallback((d) => { setPlaying(false); setDemo(d) }, [])
  /** Play/pause button: play runs the timed show; pause holds the timer and the animations. */
  const togglePlay = useCallback(() => { setPlaying(p => { setPaused(p); return !p }) }, [])

  // Steer the audience phones whenever the slide changes.
  useEffect(() => {
    if (READ_ONLY) return
    api.post('/api/live-admin/control', controlFor(slide))
      .then(() => setError(''))
      .catch(e => setError(`Audience polls unavailable: ${e.message}`))
  }, [slide])

  // Play mode: count this slide's speaking time and advance when it is used up.
  useEffect(() => {
    if (!playing || demo || EXPORT) return undefined
    const t = setInterval(() => setElapsed(e => e + 0.25), 250)
    return () => clearInterval(t)
  }, [playing, demo])
  useEffect(() => {
    if (!playing || elapsed < duration) return
    if (index < deck.slides.length - 1) go(index + 1)
    else setPlaying(false)
  }, [elapsed, duration, playing, index, go])

  useEffect(() => {
    if (STATIC) return undefined
    /** Keyboard (or presentation clicker) control. */
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, button')) return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(index + 1) }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(index - 1) }
      else if (e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K') togglePlay()
      else if (e.key === 'n' || e.key === 'N') setNotes(v => !v)
      else if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else rootRef.current?.requestFullscreen?.() }
      else if (e.key === 'Escape') setDemo(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, go, togglePlay])

  /** Clear every vote before the talk starts (asks first). */
  const resetPolls = async () => {
    if (!window.confirm('Clear all audience votes?')) return
    try { await api.post('/api/live-admin/reset', {}); setError('') } catch (e) { setError(e.message) }
  }

  const minutesLeft = useMemo(() => deck.slides.slice(index).reduce((a, s) => a + (s.minutes || 0), 0), [index])
  const last = deck.slides.length - 1

  return (
    <div ref={rootRef} className={`pd${STATIC ? ' pd-static' : ''}${paused ? ' pd-paused' : ''}`} aria-roledescription="slide deck">
      <div className="pd-stage" style={{ transform: `scale(${scale}) translate(-50%, -50%)` }}>
        {!EXPORT && <div className="pd-progress" style={{ width: `${(100 * (index + 1)) / deck.slides.length}%` }} />}
        <div key={slide.id} className="pd-slide" role="group" aria-roledescription="slide"
          aria-label={`${index + 1} of ${deck.slides.length}: ${slide.headline}`}>
          <Slide slide={slide} polls={polls} index={index} onOpenDemo={() => openDemo(slide.demo)} />
        </div>
        {!EXPORT && <p className="sr-only" aria-live="polite">{`Slide ${index + 1} of ${deck.slides.length}: ${slide.headline}`}</p>}
        {!EXPORT && (
          <nav className="pd-nav" aria-label="Slide navigation">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
              <ChevronLeft aria-hidden="true"><title>Previous slide</title></ChevronLeft>
            </button>
            <button type="button" className="play" onClick={togglePlay} aria-pressed={playing}
              aria-label={playing ? 'Pause the presentation' : 'Play the presentation (timed)'}>
              {playing ? <Pause aria-hidden="true"><title>Pause</title></Pause> : <Play aria-hidden="true"><title>Play</title></Play>}
              <span className="timer" style={{ width: `${Math.min(100, (100 * elapsed) / duration)}%` }} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(index + 1)} disabled={index === last} aria-label="Next slide">
              <ChevronRight aria-hidden="true"><title>Next slide</title></ChevronRight>
            </button>
            <span className="pos" aria-live="polite">{index + 1} / {deck.slides.length}</span>
          </nav>
        )}
      </div>
      {demo && (
        <div className="pd-frame">
          <iframe title={demo.label} src={demo.path} />
          <div className="pd-frame-bar"><button type="button" onClick={() => setDemo(null)}>← Back to slides</button></div>
        </div>
      )}
      {notes && <div className="pd-notes" role="note"><b>Notes · ~{slide.minutes} min · {minutesLeft.toFixed(1)} min to the end</b><br />{slide.notes}</div>}
      {!READ_ONLY && (
        <div className="pd-chrome">
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setNotes(v => !v)} aria-pressed={notes}>Notes (N)</button>
            <button type="button" onClick={() => rootRef.current?.requestFullscreen?.()}>Full screen (F)</button>
            <button type="button" onClick={resetPolls}>Reset votes</button>
          </div>
          {error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>}
        </div>
      )}
    </div>
  )
}
