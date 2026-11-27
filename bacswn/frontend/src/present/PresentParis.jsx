/**
 * Paris carbon-markets talk: full-screen presenter deck.
 *
 * What: eight slides that tell the audience what they will hear, tell them, then tell them
 * what they heard: introduction and agenda, the system today, the problems, our solution,
 * two demo slides, a recap and questions. Every point is an icon in a column; an arrow draws
 * down from each icon to the next as the talk reaches it.
 * Why: the talk is told with pictures and motion; the words live in the speaker notes.
 * How: slide content comes from paris-deck.json (shared with the PPTX/PDF exporter). Each
 * slide is drawn on a fixed 1920x1080 stage scaled to the screen. The show runs by itself:
 * a slide's points appear at speaking pace across its `minutes`, then it moves on. The
 * clicker or → brings the next point in early (or the next slide when all are shown);
 * ← goes back. A start screen enters full screen. Opening a live demo pauses the timer;
 * closing it resumes the show by itself.
 * Keys: → / Space / PageDown next, ← / PageUp back, P pause, N notes, F full screen,
 * Esc closes a live demo. `?static=1&slide=N` renders a slide's final frame without
 * controls (for checks and exports). `?self=1` (the public demo) waits for → on every slide.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import deck from './paris-deck.json'
import qrUrl from './qr-live.svg'
import {
  ArrowLeft, ArrowRight, Ban, Hourglass, CloudLightning, CopyX, Database, FileCheck2, FileSignature, FileX, Landmark, Lightbulb,
  ListChecks, MapPin, Maximize, MessageCircleQuestion, MonitorPlay, NotebookPen, Pause, Plane, Play, RadioTower, Scale,
  SearchCheck, ShieldCheck, TrendingUp, TriangleAlert, UserRound, Waves, Wind,
} from 'lucide-react'
import '@fontsource-variable/inter'
import './present.css'

const PARAMS = new URLSearchParams(window.location.search)
/** Final frame only, no controls (exports and checks). */
const STATIC = PARAMS.get('static') === '1'
/** Self-guided (the public demo): points build by themselves, but each slide waits for →. */
const SELF = PARAMS.get('self') === '1'
const START = Math.max(0, Math.min(deck.slides.length - 1, Number(PARAMS.get('slide') || window.location.hash.slice(1) || 0) || 0))
const STAGE_W = 1920
const STAGE_H = 1080

/** Icons the deck JSON may name. */
const ICONS = {
  Ban, CloudLightning, CopyX, Database, Hourglass, FileCheck2, FileSignature, FileX, Landmark, Lightbulb, ListChecks, MapPin,
  MonitorPlay, Plane, RadioTower, Scale, SearchCheck, ShieldCheck, TrendingUp, TriangleAlert, UserRound, Waves, Wind,
}

/** A named icon; hidden from screen readers because a visible label always sits beside it. */
function Icon({ name, ...props }) {
  const C = ICONS[name]
  return C ? <C aria-hidden="true" focusable="false" {...props} /> : null
}

/** How many build steps a slide has (each step brings in one point or row). */
function stepsOf(slide) {
  if (slide.kind === 'intro') return deck.agenda.length
  if (slide.kind === 'title') return 2
  if (slide.kind === 'recap') return slide.rows.length + 1
  if (slide.kind === 'questions') return 1
  return slide.items.length
}

/** Speaking pace the timings assume: a natural presenter, words per minute. */
const WPM = deck.wpm || 140

/** The notes as spoken: checks in [brackets] are not read out. */
const spoken = (notes) => (notes || '').replace(/\[[^\]]*\]/g, '')

/**
 * When each step appears, in seconds after the slide opens: the moment the presenter
 * reaches that point in the speaker notes. Each step has a cue (the phrase that introduces
 * it); its time is the words spoken before the cue at the natural pace. Steps without a
 * cue follow two seconds after the one before.
 */
function scheduleOf(slide) {
  const text = spoken(slide.notes)
  const at = (cue) => {
    const i = cue ? text.indexOf(cue) : -1
    return i < 0 ? null : 0.8 + (text.slice(0, i).split(/\s+/).filter(Boolean).length * 60) / WPM
  }
  const out = []
  for (let i = 0; i < stepsOf(slide); i += 1) {
    const t = at(slide.cues?.[i])
    out.push(t ?? (i ? out[i - 1] + 2 : 0.8))
  }
  return out
}

/** Scale factor that fits the 1920x1080 stage inside the window. */
function useStageScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return scale
}

/** The agenda across the top; the part of the talk now on screen is lit. */
function Rail({ stage }) {
  if (!stage) return null
  return (
    <ol className="pd-rail" aria-label="Agenda">
      {deck.agenda.map((a, i) => (
        <li key={a.label} className={i + 1 === stage ? 'on' : i + 1 < stage ? 'past' : ''} aria-current={i + 1 === stage ? 'step' : undefined}>
          <Icon name={a.icon} strokeWidth={2.25} />{a.label}
        </li>
      ))}
    </ol>
  )
}

/** Positions of n icons spread down the stage. */
const spread = (n, y0, y1) => Array.from({ length: n }, (_, i) => (n === 1 ? (y0 + y1) / 2 : y0 + (i * (y1 - y0)) / (n - 1)))

/** An arrow that draws itself down from one icon to the next. */
function VArrow({ x, y1, y2, show, tone = 'line' }) {
  if (!show) return null
  const h = y2 - y1
  return (
    <svg className={`pd-arrow v ${tone}`} style={{ left: x - 30, top: y1, height: h }} viewBox={`0 0 60 ${h}`} aria-hidden="true">
      <line x1="30" y1="0" x2="30" y2={h - 22} />
      <path d={`M 12 ${h - 26} L 30 ${h - 2} L 48 ${h - 26} Z`} />
    </svg>
  )
}

/** One point in a column: an icon in a ring, with its theme, label and detail to the right. */
function Point({ item, x, y, r, tone, w, size = 'lg', onOpenDemo, delayed, activeDemo }) {
  return (
    <div className={`pd-vpt ${tone} ${size}${delayed ? ' after-arrow' : ''}`} style={{ left: x - r, top: y - r, height: 2 * r, width: 2 * r + 40 + w }}>
      <div className="ring" style={{ width: 2 * r, height: 2 * r }}><Icon name={item.icon} strokeWidth={1.75} /></div>
      <div className="txt" style={{ width: w }}>
        {item.theme && <div className="theme">{item.theme}</div>}
        <div className="lbl">{item.label}</div>
        {item.detail && <div className="det">{item.detail}</div>}
        {item.demo && onOpenDemo && (
          <button type="button" className={`pd-demo-btn${activeDemo === item.demo.path ? ' on' : ''}`} onClick={() => onOpenDemo(item.demo)}
            aria-pressed={activeDemo === item.demo.path} aria-label={`Show live demo: ${item.demo.label}`}>
            <MonitorPlay aria-hidden="true" strokeWidth={2.25} />Live demo
          </button>
        )}
      </div>
    </div>
  )
}

/** A column of points joined by downward arrows, revealed one at a time. */
function Column({ items, x, y0, y1, r, tone, w, size, step, onOpenDemo, activeDemo }) {
  const ys = spread(items.length, y0, y1)
  return items.map((it, i) => (
    <div key={it.label}>
      {i > 0 && <VArrow x={x} y1={ys[i - 1] + r + 14} y2={ys[i] - r - 14} show={step >= i} tone={tone} />}
      {step >= i && <Point item={it} x={x} y={ys[i]} r={r} tone={tone} w={w} size={size} delayed={i > 0} onOpenDemo={onOpenDemo} activeDemo={activeDemo} />}
    </div>
  ))
}

/** System, problems, solution and demo slides: a headline, then the points down a column. */
function ChainSlide({ slide, step, onOpenDemo }) {
  const demo = slide.kind === 'demo'
  const y0 = slide.sub ? 380 : demo ? 350 : 310
  if (demo) return <DemoSlide slide={slide} step={step} onOpenDemo={onOpenDemo} />
  return (
    <>
      <h2 className="pd-h left">{slide.headline}</h2>
      {slide.sub && <p className="pd-h-sub">{slide.sub}</p>}
      <Column items={slide.items} x={200} y0={y0} y1={900} r={52} tone={slide.tone || 'accent'} w={1250} step={step} />
      {slide.source && step >= slide.items.length - 1 && <span className="pd-source">{slide.source}</span>}
    </>
  )
}

/**
 * A demo slide: the steps down a column on the left, and the live demo itself on the right,
 * working and clickable on the slide. "Live demo" under a step switches the panel to that
 * demo; the expand button opens it full screen. Moving the mouse off the panel hands the
 * keyboard (and the clicker) back to the slides.
 */
function DemoSlide({ slide, step, onOpenDemo }) {
  const demos = slide.items.filter(it => it.demo).map(it => it.demo)
  const [active, setActive] = useState(demos[0])
  return (
    <>
      <h2 className="pd-h left">{slide.headline}</h2>
      <Column items={slide.items} x={180} y0={340} y1={860} r={46} tone="accent" w={440} size="xs" step={step}
        onOpenDemo={setActive} activeDemo={active?.path} />
      {active && (
        <div className="pd-embed" onMouseLeave={() => document.activeElement?.blur?.()}>
          <div className="view"><iframe key={active.path} title={`Live demo: ${active.label}`} src={active.path} /></div>
          <button type="button" className="pd-embed-max" onClick={() => onOpenDemo?.(active)} aria-label={`Open ${active.label} full screen`}>
            <Maximize aria-hidden="true" strokeWidth={2.25} />
          </button>
        </div>
      )}
    </>
  )
}

/** What the talk is about: the title, one sentence, and the idea as two icons joined by an arrow. */
function TitleSlide({ slide, step }) {
  return (
    <>
      <svg className="pd-arcs" viewBox="0 0 1920 1080" aria-hidden="true">
        {[...Array(9)].map((_, i) => <path key={i} d={`M ${-120 + i * 48} ${980 - i * 70} Q 960 ${-240 + i * 84} ${2040 - i * 36} ${360 + i * 66}`} />)}
      </svg>
      <h1 className="pd-intro-title" style={{ top: 150 }}>{slide.headline}</h1>
      <p className="pd-title-about">{slide.sub}</p>
      {step >= 0 && <Point item={slide.from} x={840} y={600} r={64} tone="bad" w={400} size="sm" />}
      <VArrow x={840} y1={678} y2={772} show={step >= 1} tone="ok" />
      {step >= 1 && <Point item={slide.to} x={840} y={850} r={64} tone="ok" w={400} size="sm" delayed />}
      <p className="pd-meta">{deck.event}</p>
    </>
  )
}

/** Who is speaking and for whom, then the agenda drawn down a column of icons and arrows. */
function IntroSlide({ slide, step }) {
  const p = deck.presenter
  return (
    <>
      <svg className="pd-arcs" viewBox="0 0 1920 1080" aria-hidden="true">
        {[...Array(9)].map((_, i) => <path key={i} d={`M ${-120 + i * 48} ${980 - i * 70} Q 960 ${-240 + i * 84} ${2040 - i * 36} ${360 + i * 66}`} />)}
      </svg>
      <h2 className="pd-h">{slide.headline}</h2>
      <div className="pd-presenter">
        <div className="avatar"><UserRound aria-hidden="true" strokeWidth={1.75} /></div>
        <div>
          <div className="name">{p.name}</div>
          <div className="role">{p.role}, {p.org}</div>
          <div className="tag">{p.tagline}</div>
        </div>
      </div>
      <Column items={deck.agenda} x={1240} y0={320} y1={920} r={44} tone="agenda" w={440} size="sm" step={step} />
    </>
  )
}

/** What I told you: one column per theme, its problem, an arrow down, its fix; then the outcome. */
function RecapSlide({ slide, step }) {
  const xs = [420, 960, 1500]
  return (
    <>
      <h2 className="pd-h">{slide.headline}</h2>
      {slide.rows.map((r, i) => step >= i && (
        <div key={r.topic} className="pd-recap-col" style={{ left: xs[i] - 260 }}>
          <div className="topic">{r.topic}</div>
          <span className="pd-mini bad"><Icon name={r.problem.icon} strokeWidth={2} /></span>
          <div className="lbl bad">{r.problem.label}</div>
          <svg className="pd-arrow v ok inline" viewBox="0 0 60 80" aria-hidden="true"><line x1="30" y1="0" x2="30" y2="58" /><path d="M 12 54 L 30 78 L 48 54 Z" /></svg>
          <span className="pd-mini ok after-arrow"><Icon name={r.fix.icon} strokeWidth={2} /></span>
          <div className="lbl ok after-arrow">{r.fix.label}</div>
        </div>
      ))}
      {step >= slide.rows.length && (
        <div className="pd-recap-result">
          <span className="pd-mini gold"><Icon name={slide.result.icon} strokeWidth={2} /></span>{slide.result.label}
        </div>
      )}
    </>
  )
}

/** Questions, with the QR code to the demos. */
function QuestionsSlide({ slide }) {
  const p = deck.presenter
  return (
    <>
      <div className="pd-q-icon"><MessageCircleQuestion aria-hidden="true" strokeWidth={1.5} /></div>
      <h2 className="pd-q">{slide.headline}</h2>
      <p className="pd-q-who">{p.name} · {p.role}, {p.org}</p>
      <figure className="pd-revisit">
        <img src={qrUrl} alt={`QR code: ${deck.joinUrl}`} />
        <figcaption>Explore the demos on your phone</figcaption>
      </figure>
    </>
  )
}

function Slide({ slide, step, onOpenDemo }) {
  switch (slide.kind) {
    case 'title': return <TitleSlide slide={slide} step={step} />
    case 'intro': return <IntroSlide slide={slide} step={step} />
    case 'recap': return <RecapSlide slide={slide} step={step} />
    case 'questions': return <QuestionsSlide slide={slide} />
    default: return <ChainSlide slide={slide} step={step} onOpenDemo={onOpenDemo} />
  }
}

/**
 * The presenter deck: start screen, full screen, the self-running show with its step
 * schedule, arrow navigation, notes and live-demo frames.
 */
export default function PresentParis() {
  const [index, setIndex] = useState(START)
  const [step, setStep] = useState(STATIC ? 99 : -1)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(STATIC)
  const [notes, setNotes] = useState(false)
  const [demo, setDemo] = useState(null)
  const rootRef = useRef(null)
  const scale = useStageScale()
  const slide = deck.slides[index]
  const schedule = useMemo(() => scheduleOf(slide), [slide])
  const total = schedule.length
  // 0: the slide waits for the presenter (questions, and live demos, which take as long as they take)
  const duration = SELF || slide.kind === 'demo' ? 0 : (slide.minutes || 0) * 60
  const last = deck.slides.length - 1

  /** Show slide i; `complete` shows every point at once (going back). */
  const go = useCallback((i, complete = false) => {
    const next = Math.max(0, Math.min(last, i))
    const sch = scheduleOf(deck.slides[next])
    setIndex(next)
    setDemo(null)
    setStep(complete ? sch.length - 1 : -1)
    setElapsed(complete ? sch[sch.length - 1] : 0)
    window.history.replaceState(null, '', `${window.location.search}#${next}`)
  }, [last])

  /** Next: bring in the next point early, or move on when all are shown. */
  const forward = useCallback(() => {
    if (step < total - 1) { const s = step + 1; setStep(s); setElapsed(e => Math.max(e, schedule[s])) }
    else go(index + 1)
  }, [step, total, schedule, go, index])

  const fullScreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }, [])

  /** Start screen: full screen, then the show runs. */
  const start = useCallback(() => {
    rootRef.current?.requestFullscreen?.().catch(() => {})
    setStarted(true)
    setPlaying(true)
    go(index)
  }, [go, index])

  const openDemo = useCallback((d) => { setPlaying(false); setDemo(d) }, [])
  /** Back from a live demo: the show carries on by itself, no need to press Play. */
  const closeDemo = useCallback(() => { setDemo(null); setPlaying(true) }, [])

  // The show's clock: runs while playing, not while a demo is open.
  useEffect(() => {
    if (!started || !playing || demo || STATIC) return undefined
    const t = setInterval(() => setElapsed(e => e + 0.25), 250)
    return () => clearInterval(t)
  }, [started, playing, demo])

  // Points appear when their time comes; the slide moves on when its time is up.
  useEffect(() => {
    if (STATIC || !started) return
    let s = step
    while (s + 1 < total && elapsed >= schedule[s + 1]) s += 1
    if (step < 0 && elapsed >= schedule[0]) s = Math.max(s, 0)
    if (s !== step) setStep(s)
    if (playing && duration > 0 && elapsed >= duration && index < last) go(index + 1)
  }, [elapsed, step, total, schedule, playing, duration, index, last, go, started])

  useEffect(() => {
    if (STATIC) return undefined
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      if (!started) { if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); start() } return }
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); forward() }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(index - 1, true) }
      else if (e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K') setPlaying(p => !p)
      else if (e.key === 'n' || e.key === 'N') setNotes(v => !v)
      else if (e.key === 'f' || e.key === 'F') fullScreen()
      else if (e.key === 'Escape' && demo) closeDemo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, start, forward, go, index, fullScreen, demo, closeDemo])

  const minutesLeft = deck.slides.slice(index).reduce((a, s) => a + (s.minutes || 0), 0)
  const progress = duration > 0 ? Math.min(100, (100 * elapsed) / duration) : 0

  return (
    <div ref={rootRef} className={`pd${STATIC ? ' pd-static' : ''}${playing || STATIC ? '' : ' pd-paused'}`} aria-roledescription="slide deck">
      <div className="pd-stage" style={{ transform: `scale(${scale}) translate(-50%, -50%)` }}>
        <Rail stage={slide.stage} />
        <div key={slide.id} className="pd-slide" role="group" aria-roledescription="slide"
          aria-label={`${index + 1} of ${deck.slides.length}: ${slide.headline}`}>
          <Slide slide={slide} step={step} onOpenDemo={openDemo} />
        </div>
        {!STATIC && <p className="sr-only" aria-live="polite">{`Slide ${index + 1} of ${deck.slides.length}: ${slide.headline}`}</p>}
        {!STATIC && started && (
          <nav className="pd-nav" aria-label="Slide navigation">
            <button type="button" onClick={() => go(index - 1, true)} disabled={index === 0} aria-label="Previous slide">
              <ArrowLeft aria-hidden="true" strokeWidth={2.5} />
            </button>
            <button type="button" className="play" onClick={() => setPlaying(p => !p)} aria-pressed={playing}
              aria-label={playing ? 'Pause the presentation' : 'Resume the presentation'}>
              {playing ? <Pause aria-hidden="true" strokeWidth={2.5} /> : <Play aria-hidden="true" strokeWidth={2.5} />}
              <span className="timer" style={{ width: `${progress}%` }} aria-hidden="true" />
            </button>
            <button type="button" onClick={forward} disabled={index === last && step >= total - 1} aria-label="Next">
              <ArrowRight aria-hidden="true" strokeWidth={2.5} />
            </button>
          </nav>
        )}
      </div>
      {!started && (
        <button type="button" className="pd-start" onClick={start} aria-label="Start the presentation in full screen">
          <Play aria-hidden="true" strokeWidth={2} />
          {SELF && <span className="pd-start-hint">Press → (or the arrow buttons) to move on.<br />The demos on slides 6 and 7 are live: try them.</span>}
        </button>
      )}
      {demo && (
        <div className="pd-frame">
          <iframe title={demo.label} src={demo.path} />
          <button type="button" className="pd-frame-close" onClick={closeDemo} aria-label="Back to the slides">
            <ArrowLeft aria-hidden="true" strokeWidth={2.5} />
          </button>
        </div>
      )}
      {notes && <div className="pd-notes" role="note"><b>~{slide.minutes || '–'} min · {minutesLeft.toFixed(1)} min to the end</b><br />{slide.notes}</div>}
      {!STATIC && started && (
        <div className="pd-chrome">
          <button type="button" onClick={() => setNotes(v => !v)} aria-pressed={notes} aria-label="Speaker notes (N)"><NotebookPen aria-hidden="true" /></button>
          <button type="button" onClick={fullScreen} aria-label="Full screen (F)"><Maximize aria-hidden="true" /></button>
        </div>
      )}
    </div>
  )
}
