/**
 * Audience companion app for the Paris talk (/live): vote, then explore the demos.
 *
 * What: during the talk it shows the question the presenter has opened and takes the
 * visitor's answer (changeable until revealed), then the room's results. Between
 * questions and after the talk, the same page offers the self-guided demos (credit
 * journey, check a claim, Dorian replay) and every revealed result.
 * Why: one QR code on the slides leads to one interactive app tied to the presentation;
 * it must work instantly on any phone, with no account.
 * How: polls the public GET /api/live/state every 2 s and votes with POST /api/live/vote
 * using a random id kept in localStorage (one vote per phone per question). Revealed
 * results come from GET /api/live/revealed. When a new question opens, the Vote tab comes
 * to the front. Plain fetch, no auth headers.
 */
import { useEffect, useRef, useState } from 'react'
import { BarChart3, CircleCheckBig, CloudLightning, Route, Vote } from 'lucide-react'
import deck from './paris-deck.json'
import { ApiError } from '../api/errors'
import { ClaimCheck, DorianReplay, Journey, NOTE, RoomResults } from './Companion'
import '@fontsource-variable/inter'
import './present.css'

/** This phone's anonymous id, created once and kept in localStorage when available. */
function clientId() {
  try {
    let id = localStorage.getItem('live-client')
    if (!id) { id = `p${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`; localStorage.setItem('live-client', id) }
    return id
  } catch {
    return `p${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`
  }
}
const CLIENT = clientId()

/** GET/POST JSON without the app's login handling (the audience has no account). */
async function call(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status, data)
  return data
}

/** Percent of `n` in `total`, rounded. */
const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0)

/** Tabs of the companion app, each with a titled Lucide icon. */
const TABS = [
  { id: 'vote', label: 'Vote', icon: Vote },
  { id: 'journey', label: 'Journey', icon: Route },
  { id: 'check', label: 'Check', icon: CircleCheckBig },
  { id: 'dorian', label: 'Dorian', icon: CloudLightning },
  { id: 'results', label: 'Results', icon: BarChart3 },
]

/** The voting panel: the open question, the phone's answer, and the reveal. */
function VotePanel({ active, mine, onVote, results, error }) {
  if (!active) {
    return (
      <div className="lv-wait" role="status">
        <span className="dot" aria-hidden="true" />
        <p className="lv-note">No question open right now. The next one appears here automatically — meanwhile, explore the demos.</p>
      </div>
    )
  }
  return (
    <section aria-labelledby="lv-q">
      <h2 id="lv-q" className="lv-q">{active.question}</h2>
      {active.options.map(o => {
        const chosen = mine[active.id] === o.id
        const n = results?.counts?.[o.id] || 0
        const isAnswer = active.revealed && active.answer === o.id
        return (
          <button key={o.id} type="button" className={`lv-opt${isAnswer ? ' answer' : ''}`} aria-pressed={chosen}
            onClick={() => onVote(o.id)} disabled={active.revealed}>
            {results && <span className="fill" style={{ width: `${pct(n, results.total)}%` }} />}
            <span className="t"><span>{o.label}{isAnswer ? ' ✓' : ''}</span>{results && <b>{pct(n, results.total)}%</b>}</span>
          </button>
        )
      })}
      <p role="status" className="lv-note">
        {active.revealed ? active.reveal_note : mine[active.id] ? 'Thanks — you can change your answer until the results are shown.' : 'Tap an answer.'}
      </p>
      {error && <p role="alert" className="lv-note" style={{ color: '#fca5a5' }}>{error}</p>}
    </section>
  )
}

/** The companion app. */
export default function Live() {
  const [active, setActive] = useState(null)
  const [mine, setMine] = useState(() => { try { return JSON.parse(localStorage.getItem('live-votes') || '{}') } catch { return {} } })
  const [revealed, setRevealed] = useState({})
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [tab, setTab] = useState('journey')
  const lastActive = useRef(null)

  useEffect(() => {
    let stop = false
    /** Refresh the open question and the revealed results; bring Vote forward on a new question. */
    const tick = async () => {
      try {
        const [s, r] = await Promise.all([call('/api/live/state'), call('/api/live/revealed')])
        if (stop) return
        setOffline(false)
        setActive(s.active)
        setRevealed(Object.fromEntries(r.polls.map(p => [p.poll, p])))
        const id = s.active?.id || null
        if (id && id !== lastActive.current) setTab('vote')
        lastActive.current = id
      } catch { if (!stop) setOffline(true) }
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  /** Send (or change) this phone's answer. */
  const vote = async (choice) => {
    setError('')
    try {
      await call('/api/live/vote', { poll: active.id, client: CLIENT, choice })
      const next = { ...mine, [active.id]: choice }
      setMine(next)
      try { localStorage.setItem('live-votes', JSON.stringify(next)) } catch { /* private mode: the vote still counts */ }
    } catch (e) { setError(e.message) }
  }

  return (
    <main className="lv">
      <h1>{deck.title}</h1>
      <p className="dim">{deck.speaker}</p>
      {offline && <p role="alert" className="lv-note">Reconnecting…</p>}
      <nav className="lv-tabs" aria-label="Companion sections">
        {TABS.map(t => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            <t.icon aria-hidden="true" focusable="false"><title>{t.label}</title></t.icon>
            <span>{t.label}</span>
            {t.id === 'vote' && active && !active.revealed && <i className="badge" aria-label="question open" />}
          </button>
        ))}
      </nav>
      {tab === 'vote' && <VotePanel active={active} mine={mine} onVote={vote} results={active ? revealed[active.id] : null} error={error} />}
      {tab === 'journey' && <Journey />}
      {tab === 'check' && <ClaimCheck />}
      {tab === 'dorian' && <DorianReplay />}
      {tab === 'results' && <RoomResults results={revealed} />}
      <p className="lv-foot">{NOTE}</p>
    </main>
  )
}
