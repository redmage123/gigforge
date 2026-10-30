import { useState } from 'react'
import { HAZARD_COLORS } from './PrecogChamber'

const simClock = (iso) => new Date(iso).toISOString().slice(11, 16) + 'Z'
const Hz = ({ h }) => <b style={{ color: HAZARD_COLORS[h] }}>{h}</b>
const STATUS_BADGE = { OPEN: 'blue', VINDICATED: 'green', DISMISSED: 'grey' }
const RESULT_BADGE = { CONFIRMED: 'green', REJECTED: 'red', UNVERIFIED: 'amber' }
const VOTE_COLOR = { AGREE: '#10b981', DISAGREE: '#ef4444', ABSTAIN: '#94a3b8' }
const MSG_COLOR = { ALERT: '#ef4444', HAZARD: '#f59e0b', VOTE: '#eab308', PROPAGATION: '#a855f7', MAINT: '#f97316', HEARTBEAT: '#64748b' }

function MinorityReports({ rows, onSelect }) {
  return (
    <table>
      <thead><tr><th>Time</th><th>Report</th><th>Station</th><th>Model</th><th>Minority</th><th>Majority</th><th>Reasoning</th><th>Outcome</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} onClick={() => onSelect(r.station)} style={{ cursor: 'pointer' }}>
            <td className="mono dim">{simClock(r.time)}</td>
            <td className="mono">{r.id}</td>
            <td><b>{r.station}</b></td>
            <td>{r.precog}{r.corrupted && <span className="mbadge red" style={{ marginLeft: 4 }}>CORRUPT</span>}</td>
            <td><Hz h={r.minority_call} /> <span className="dim">{Math.round(r.confidence * 100)}%</span></td>
            <td><Hz h={r.majority_call} /></td>
            <td className="dim" style={{ maxWidth: 360 }}>{r.reason}</td>
            <td><span className={`mbadge ${STATUS_BADGE[r.status]}`}>{r.status}</span>{r.outcome && <div className="dim" style={{ fontSize: 11 }}>{r.outcome}</div>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Consensus({ rows, onSelect }) {
  return (
    <table>
      <thead><tr><th>Time</th><th>Origin</th><th>Claim</th><th>Peer votes (from their own radar)</th><th>Result</th></tr></thead>
      <tbody>
        {rows.map(e => (
          <tr key={e.id} onClick={() => onSelect(e.station)} style={{ cursor: 'pointer' }}>
            <td className="mono dim">{simClock(e.time)}</td>
            <td><b>{e.station}</b></td>
            <td><Hz h={e.claim} /></td>
            <td>
              {Object.entries(e.votes).map(([s, v]) => (
                <div key={s} style={{ fontSize: 11.5 }}>
                  <b>{s}</b> <span style={{ color: VOTE_COLOR[v], fontWeight: 700 }}>{v}</span> <span className="dim">{e.reasons[s]}</span>
                </div>
              ))}
              {!Object.keys(e.votes).length && <span className="dim">No reachable peers</span>}
            </td>
            <td><span className={`mbadge ${RESULT_BADGE[e.result]}`}>{e.result}</span><div className="dim" style={{ fontSize: 11 }}>{e.detail}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Traffic({ rows }) {
  return (
    <table>
      <thead><tr><th>Time</th><th>Type</th><th>Path</th><th>Via</th><th>Payload</th></tr></thead>
      <tbody>
        {rows.map(m => (
          <tr key={m.id}>
            <td className="mono dim">{simClock(m.time)}</td>
            <td><span className="mbadge" style={{ background: MSG_COLOR[m.type] + '26', color: MSG_COLOR[m.type] }}>{m.type}</span></td>
            <td className="mono">{m.path.join(' → ')}</td>
            <td className="dim">{m.via}{m.hops > 1 ? ` · ${m.hops} hops` : ''}</td>
            <td className="dim">{m.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Propagation({ rows }) {
  if (!rows.length) return <div className="dim" style={{ padding: 12 }}>No cells currently being handed off between stations.</div>
  return (
    <table>
      <thead><tr><th>From</th><th>To</th><th>Phenomenon</th><th>Motion</th><th>ETA</th></tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.source + p.target + p.cell}>
            <td><b>{p.source}</b></td><td><b>{p.target}</b></td>
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
  return (
    <table>
      <thead><tr><th>Time</th><th>Station</th><th>Event</th><th>Detail</th></tr></thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={e.tick + e.kind + i} onClick={() => e.station !== '—' && onSelect(e.station)} style={{ cursor: 'pointer' }}>
            <td className="mono dim">{simClock(e.time)}</td>
            <td><b>{e.station}</b></td>
            <td><span className="mbadge amber">{e.kind}</span></td>
            <td className="dim">{e.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function MeshLogs({ data, onSelect }) {
  const [tab, setTab] = useState('minority')
  const tabs = [
    ['minority', 'Minority Reports', (data.minority_reports || []).filter(r => r.status === 'OPEN').length],
    ['consensus', 'Consensus Votes', 0],
    ['traffic', 'Mesh Traffic', 0],
    ['propagation', 'Hand-offs', (data.propagation_forecasts || []).length],
    ['events', 'Event Log', 0],
  ]
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="mesh-tabs">
        {tabs.map(([id, label, n]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n ? <span className="n">{n}</span> : null}
          </button>
        ))}
      </div>
      <div className="mesh-log">
        {tab === 'minority' && <MinorityReports rows={data.minority_reports || []} onSelect={onSelect} />}
        {tab === 'consensus' && <Consensus rows={data.consensus_events || []} onSelect={onSelect} />}
        {tab === 'traffic' && <Traffic rows={[...(data.messages || []), ...(data.heartbeats || [])].sort((a, b) => b.id - a.id)} />}
        {tab === 'propagation' && <Propagation rows={data.propagation_forecasts || []} />}
        {tab === 'events' && <Events rows={data.events || []} onSelect={onSelect} />}
      </div>
    </div>
  )
}
