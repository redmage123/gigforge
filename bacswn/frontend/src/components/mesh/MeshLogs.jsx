import { useRef, useState } from 'react'
import { hz } from './PrecogChamber'

const simClock = (iso) => new Date(iso).toISOString().slice(11, 16) + 'Z'
const Hz = ({ h }) => <b style={{ color: hz(h) }}>{h}</b>
const STATUS_BADGE = { OPEN: 'blue', VINDICATED: 'green', DISMISSED: 'grey' }
const RESULT_BADGE = { CONFIRMED: 'green', REJECTED: 'red', UNVERIFIED: 'amber' }
const STATUS_TEXT = { healthy: 'Healthy', caution: 'Caution', degraded: 'Degraded', offline: 'Offline' }

/** Station code as a real button (keyboard + screen reader), selecting it in the chamber. */
const StationBtn = ({ code, onSelect }) => (
  code && code !== '—'
    ? <button type="button" className="link-btn" onClick={() => onSelect(code)} aria-label={`${code}: show in precog chamber`}>{code}</button>
    : <span>{code}</span>
)

const Caption = ({ children }) => <caption className="sr-only">{children}</caption>

function Stations({ nodes, onSelect }) {
  return (
    <table>
      <Caption>All stations — text equivalent of the map</Caption>
      <thead><tr>
        <th scope="col">Station</th><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Verdict</th>
        <th scope="col">Agreement</th><th scope="col">Route to hub</th><th scope="col">Queued</th><th scope="col">Faults</th>
      </tr></thead>
      <tbody>
        {nodes.map(n => (
          <tr key={n.station}>
            <th scope="row"><StationBtn code={n.station} onSelect={onSelect} />{n.is_hub && <span className="mbadge blue" style={{ marginLeft: 4 }}>HUB</span>}</th>
            <td>{n.name}</td>
            <td>{STATUS_TEXT[n.status]}</td>
            <td>{n.alive ? <Hz h={n.verdict.call} /> : '—'}</td>
            <td>{n.alive ? (n.verdict.split ? 'Split — no majority' : n.verdict.agreement) : '—'}</td>
            <td className="mono">{n.is_hub ? 'Hub' : n.route_to_hub ? `${n.route_to_hub.hops} hops · ${n.route_to_hub.latency_ms} ms` : 'No route'}</td>
            <td>{n.queue || 0}</td>
            <td className="dim">{[...n.sensor_faults.map(f => `${f} sensor`), ...n.precogs.filter(p => p.corrupted).map(p => `${p.id} corrupted`),
              ...n.precogs.filter(p => p.quarantined).map(p => `${p.id} quarantined`)].join(', ') || 'None'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cells({ cells }) {
  if (!cells.length) return <p className="dim" style={{ padding: 12 }}>No storm cells or fog banks in the region.</p>
  return (
    <table>
      <Caption>Storm cells and fog banks currently on the map</Caption>
      <thead><tr><th scope="col">Cell</th><th scope="col">Type</th><th scope="col">Intensity</th><th scope="col">Position</th><th scope="col">Motion</th><th scope="col">Radius</th></tr></thead>
      <tbody>
        {cells.map(c => (
          <tr key={c.id}>
            <th scope="row">{c.id}</th>
            <td>{c.kind}</td>
            <td>{c.kind === 'fog' ? `density ${c.intensity}` : `${c.intensity} dBZ`}</td>
            <td className="mono">{c.lat.toFixed(2)}°N {Math.abs(c.lon).toFixed(2)}°W</td>
            <td className="mono">{c.direction} {c.speed_kt} kt</td>
            <td className="mono">{c.radius_nm} nm</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Links({ links }) {
  return (
    <table>
      <Caption>Radio links between stations</Caption>
      <thead><tr><th scope="col">Link</th><th scope="col">Type</th><th scope="col">State</th><th scope="col">Distance</th><th scope="col">Latency</th><th scope="col">Traffic (last 10 ticks)</th></tr></thead>
      <tbody>
        {links.map(l => (
          <tr key={l.a + l.b}>
            <th scope="row" className="mono">{l.a}–{l.b}</th>
            <td>{l.type}</td>
            <td>{l.up ? 'Up' : <b style={{ color: 'var(--danger)' }}>Down</b>}</td>
            <td className="mono">{l.distance_nm} nm</td>
            <td className="mono">{l.latency_ms} ms</td>
            <td className="mono">{l.traffic} messages</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MinorityReports({ rows, onSelect }) {
  if (!rows.length) return <p className="dim" style={{ padding: 12 }}>No minority reports yet.</p>
  return (
    <table>
      <Caption>Minority reports: a lone model disagreeing with the other two, later scored against what happened</Caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Report</th><th scope="col">Station</th><th scope="col">Model</th><th scope="col">Minority</th><th scope="col">Majority</th><th scope="col">Reasoning</th><th scope="col">Outcome</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td className="mono dim">{simClock(r.time)}</td>
            <td className="mono">{r.id}</td>
            <td><StationBtn code={r.station} onSelect={onSelect} /></td>
            <td>{r.precog}{r.corrupted && <span className="mbadge red" style={{ marginLeft: 4 }}>CORRUPT</span>}</td>
            <td><Hz h={r.minority_call} /> <span className="dim">{Math.round(r.confidence * 100)}%</span></td>
            <td><Hz h={r.majority_call} /></td>
            <td className="dim" style={{ maxWidth: 360 }}>{r.reason}</td>
            <td><span className={`mbadge ${STATUS_BADGE[r.status]}`}>{r.status}</span>{r.outcome && <div className="dim" style={{ fontSize: 11.5 }}>{r.outcome}</div>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Consensus({ rows, onSelect }) {
  if (!rows.length) return <p className="dim" style={{ padding: 12 }}>No peer verifications yet.</p>
  return (
    <table>
      <Caption>Peer verification votes</Caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Origin</th><th scope="col">Claim</th><th scope="col">Votes (peers' own radar + satellite)</th><th scope="col">Result</th></tr></thead>
      <tbody>
        {rows.map(e => (
          <tr key={e.id}>
            <td className="mono dim">{simClock(e.time)}</td>
            <td><StationBtn code={e.station} onSelect={onSelect} /></td>
            <td><Hz h={e.claim} /></td>
            <td>
              {Object.entries(e.votes).map(([s, v]) => (
                <div key={s} style={{ fontSize: 12 }}>
                  <b>{s === 'SAT' ? 'Satellite' : s}</b> <span className={`vote vote-${v}`}>{v}</span> <span className="dim">{e.reasons[s]}</span>
                </div>
              ))}
              {!Object.keys(e.votes).length && <span className="dim">No reachable peers</span>}
            </td>
            <td><span className={`mbadge ${RESULT_BADGE[e.result]}`}>{e.result}</span><div className="dim" style={{ fontSize: 11.5 }}>{e.detail}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Traffic({ rows }) {
  return (
    <table>
      <Caption>Recent messages on the mesh, newest first</Caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Path</th><th scope="col">Via</th><th scope="col">Payload</th></tr></thead>
      <tbody>
        {rows.map(m => (
          <tr key={m.id}>
            <td className="mono dim">{simClock(m.time)}</td>
            <td><span className={`mbadge msg-${m.type}`}>{m.type}</span></td>
            <td className="mono">{m.path.join(' → ')}</td>
            <td className="dim">{m.via}{m.hops > 1 ? ` · ${m.hops} hops` : ''}</td>
            <td className="dim">{m.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Propagation({ rows, onSelect }) {
  if (!rows.length) return <p className="dim" style={{ padding: 12 }}>No cells currently being handed off between stations.</p>
  return (
    <table>
      <Caption>Storm hand-offs from one station to the next</Caption>
      <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Phenomenon</th><th scope="col">Motion</th><th scope="col">ETA</th></tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.source + p.target + p.cell}>
            <td><StationBtn code={p.source} onSelect={onSelect} /></td>
            <td><StationBtn code={p.target} onSelect={onSelect} /></td>
            <td><Hz h={p.call} /> <span className="dim">{p.cell} · {p.phenomenon}</span></td>
            <td className="mono">{p.direction} {p.speed_kt} kt</td>
            <td className="mono">{p.eta_minutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Events({ rows, onSelect }) {
  if (!rows.length) return <p className="dim" style={{ padding: 12 }}>No events yet.</p>
  return (
    <table>
      <Caption>Network events, newest first</Caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Station</th><th scope="col">Event</th><th scope="col">Detail</th></tr></thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={e.tick + e.kind + i}>
            <td className="mono dim">{simClock(e.time)}</td>
            <td><StationBtn code={e.station} onSelect={onSelect} /></td>
            <td><span className="mbadge amber">{e.kind}</span></td>
            <td className="dim">{e.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Tabbed logs (ARIA tabs pattern). The first three tabs are the text equivalent of the map. */
export default function MeshLogs({ data, onSelect }) {
  const [tab, setTab] = useState('stations')
  const refs = useRef({})
  const tabs = [
    ['stations', 'Stations', 0],
    ['cells', 'Storm cells', (data.cells || []).length],
    ['links', 'Links', (data.links || []).filter(l => !l.up).length],
    ['minority', 'Minority Reports', (data.minority_reports || []).filter(r => r.status === 'OPEN').length],
    ['consensus', 'Consensus Votes', 0],
    ['traffic', 'Mesh Traffic', 0],
    ['propagation', 'Hand-offs', (data.propagation_forecasts || []).length],
    ['events', 'Event Log', 0],
  ]
  const countLabel = { cells: 'cells', links: 'links down', minority: 'open', propagation: 'active' }
  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t[0] === tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (next == null) return
    e.preventDefault()
    const id = tabs[(next + tabs.length) % tabs.length][0]
    setTab(id)
    refs.current[id]?.focus()
  }
  return (
    <section className="card" style={{ padding: 14 }} aria-label="Mesh data and logs">
      <div className="mesh-tabs" role="tablist" aria-label="Mesh data and logs" onKeyDown={onKeyDown}>
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" id={`mesh-tab-${id}`} aria-selected={tab === id} aria-controls="mesh-tabpanel"
            tabIndex={tab === id ? 0 : -1} ref={el => { refs.current[id] = el }}
            className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n ? <span className="n"><span className="sr-only">, </span>{n}<span className="sr-only"> {countLabel[id]}</span></span> : null}
          </button>
        ))}
      </div>
      <div className="mesh-log" role="tabpanel" id="mesh-tabpanel" aria-labelledby={`mesh-tab-${tab}`} tabIndex={0}>
        {tab === 'stations' && <Stations nodes={data.nodes || []} onSelect={onSelect} />}
        {tab === 'cells' && <Cells cells={data.cells || []} />}
        {tab === 'links' && <Links links={data.links || []} />}
        {tab === 'minority' && <MinorityReports rows={data.minority_reports || []} onSelect={onSelect} />}
        {tab === 'consensus' && <Consensus rows={data.consensus_events || []} onSelect={onSelect} />}
        {tab === 'traffic' && <Traffic rows={[...(data.messages || []), ...(data.heartbeats || [])].sort((a, b) => b.id - a.id)} />}
        {tab === 'propagation' && <Propagation rows={data.propagation_forecasts || []} onSelect={onSelect} />}
        {tab === 'events' && <Events rows={data.events || []} onSelect={onSelect} />}
      </div>
    </section>
  )
}
