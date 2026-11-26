/**
 * Channel-health monitoring (Master Plan §5.5): what the network can observe
 * about its own radios and what it concludes. Data: status.comms_health from
 * services/mesh_health.py.
 *
 * Why: shows that the hub can tell a broken BACSWN component from a carrier
 * outage, interference or a bad path, and only tickets its own equipment.
 * How: renders the server's diagnoses, unhealthy links and per-station radio
 * telemetry; out-of-range readings are emphasised in text (not colour alone).
 * Presenter buttons inject comms faults through /api/mesh/fault.
 */
import { useState } from 'react'
import { api } from '../../api/client'
import { CHANNEL_BY_ID } from '../map/CommsChannels'

/** Diagnosis class -> [label, badge colour]. */
const CLASS = {
  equipment: ['Equipment fault', 'red'],
  'channel-wide': ['Channel-wide outage', 'amber'],
  interference: ['Interference', 'amber'],
  local: ['Network operator', 'blue'],
  path: ['Path problem', 'grey'],
}
/** Link channel state -> [label, badge colour]. */
const STATE = { down: ['Down', 'red'], degraded: ['Degraded', 'amber'] }
/** Coloured badge for key `k` of a [label, colour] map (grey with the raw key if unknown). */
const Badge = ({ map, k }) => { const [l, c] = map[k] || [k, 'grey']; return <span className={`mbadge ${c}`}>{l}</span> }
/** `text`, emphasised as a problem when `bad`. */
const warn = (bad, text) => (bad ? <b className="ch-bad">{text}</b> : text)

/** VHF radio telemetry: power, VSWR, received signal and noise floor. */
function Vhf({ t }) {
  if (!t) return <span className="dim">—</span>
  if (!t.powered) return warn(true, `No power (${t.supply_v} V)${t.surge_tripped ? ', surge protector tripped' : ''}`)
  return <>
    {warn(t.vswr >= 3, `VSWR ${t.vswr}:1`)} · {t.rssi_dbm != null ? `${t.rssi_dbm} dBm` : warn(true, 'no signal')} ·{' '}
    {warn(t.noise_dbm - -118 >= 10, `noise ${t.noise_dbm} dBm`)}
  </>
}
/** Cellular modem telemetry: registration, carrier and signal. */
function Cell({ t }) {
  if (!t) return <span className="dim">none</span>
  if (!t.registered) return warn(true, `Not registered (carrier ${t.carrier})`)
  return <>{warn(t.carrier !== 'A', `Carrier ${t.carrier}`)} · {t.rsrp_dbm} dBm</>
}
/** Satellite terminal telemetry: antenna current, signal bars and last short-burst-data result. */
function Sat({ t }) {
  if (!t) return <span className="dim">—</span>
  return <>{warn(t.antenna_ma === 0, `antenna ${t.antenna_ma} mA`)} · {t.bars}/5 · {warn(t.last_sbd !== 'OK', t.last_sbd)}</>
}

/**
 * The comms-health tab of the mesh logs.
 * @param {{health: object|null, nodes?: object[], onSelect?: (station: string) => void}} props
 */
export default function CommsHealth({ health, nodes, onSelect }) {
  const [station, setStation] = useState('MYEG')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!health) return <p className="dim" style={{ padding: 12 }}>Channel-health data is not available.</p>
  /** Inject a comms fault (at the chosen station unless network-wide) and report the outcome. */
  const run = async (kind, label, withStation = true) => {
    setBusy(true); setMsg('')
    try {
      await api.meshFault({ kind, ...(withStation ? { station } : {}) })
      setMsg(`${label}. Detection follows within a few simulated minutes; maintenance tickets only for faults that persist 25 minutes.`)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const f = health.faults || {}
  return (
    <div className="ch">
      <p className="dim ch-intro">
        Each station reports its radios’ readings and sends heartbeats on every channel. The hub compares them across
        stations to tell a broken component from a carrier outage, interference or a bad path, and raises a maintenance
        ticket only for BACSWN equipment.
      </p>

      <h4 className="ch-h">What the network has concluded</h4>
      {health.diagnoses.length === 0 ? <p className="dim">All channels healthy.</p> : (
        <ul className="ch-diag">
          {health.diagnoses.map(d => (
            <li key={d.key}>
              <Badge map={CLASS} k={d.class} /> <b>{d.title}</b>
              <div className="dim">{d.detail}</div>
              {d.ticket && <div className="ch-ticket">{d.ticketed ? 'Maintenance ticket sent to the BACSWN hub.' : 'Maintenance ticket if it persists 25 minutes.'}</div>}
            </li>
          ))}
        </ul>
      )}
      {health.resolved.length > 0 && (
        <details className="ch-resolved">
          <summary>Recently resolved ({health.resolved.length})</summary>
          <ul>{health.resolved.map((d, i) => <li key={d.key + i}><Badge map={CLASS} k={d.class} /> {d.title}</li>)}</ul>
        </details>
      )}

      <h4 className="ch-h" id="ch-links-h">Links not healthy ({health.links.length})</h4>
      {health.links.length === 0 ? <p className="dim">Every link channel is passing its heartbeats.</p> : (
        <table aria-labelledby="ch-links-h">
          <thead><tr><th scope="col">Link</th><th scope="col">Channel</th><th scope="col">State</th>
            <th scope="col">Heartbeat loss</th><th scope="col">Missed in a row</th><th scope="col">Telemetry alarm</th></tr></thead>
          <tbody>{health.links.slice(0, 40).map(l => (
            <tr key={l.a + l.b + l.channel}>
              <td className="mono">{l.a}–{l.b}</td><td>{CHANNEL_BY_ID[l.channel]?.short}</td><td><Badge map={STATE} k={l.state} /></td>
              <td>{l.loss_pct}%</td><td>{l.missed_in_row}</td><td className="dim">{l.alarm || 'none (heartbeats only)'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <h4 className="ch-h" id="ch-radios-h">Radio readings</h4>
      <table aria-labelledby="ch-radios-h">
        <thead><tr><th scope="col">Station</th><th scope="col">VHF</th><th scope="col">Cellular</th>
          <th scope="col">Satellite</th><th scope="col">Wired</th></tr></thead>
        <tbody>{health.stations.map(s => (
          <tr key={s.station}>
            <th scope="row"><button type="button" className="ch-st" onClick={() => onSelect?.(s.station)}>{s.station}</button></th>
            <td><Vhf t={s.vhf} /></td><td><Cell t={s.cellular} /></td><td><Sat t={s.satellite} /></td>
            <td>{s.wired ? warn(!s.wired.line_sync, s.wired.line_sync ? 'in sync' : 'no sync') : <span className="dim">none</span>}</td>
          </tr>
        ))}</tbody>
      </table>

      <fieldset className="ch-faults">
        <legend>Comms faults (presenter)</legend>
        <div className="fault-line">
          <label htmlFor="ch-station" className="fault-line-label">Station</label>
          <select id="ch-station" value={station} onChange={e => setStation(e.target.value)}>
            {(nodes || []).map(n => <option key={n.station} value={n.station}>{n.station} — {n.name}</option>)}
          </select>
        </div>
        <div className="fault-line">
          <span className="fault-line-label">At {station}</span>
          <button type="button" className="mesh-chip" disabled={busy} onClick={() => run('vhf_antenna', `VHF antenna damaged at ${station}`)}>VHF antenna damaged</button>
          <button type="button" className="mesh-chip" disabled={busy} onClick={() => run('radio_power', `VHF repeater power lost at ${station}`)}>VHF repeater power lost</button>
          <button type="button" className="mesh-chip" disabled={busy} onClick={() => run('sat_antenna', `Satellite antenna fault at ${station}`)}>Satellite antenna fault</button>
          <button type="button" className="mesh-chip" disabled={busy} onClick={() => run('vhf_interference', `VHF interference near ${station}`)}>VHF interference here</button>
        </div>
        <div className="fault-line">
          <span className="fault-line-label">Network-wide</span>
          <button type="button" className="mesh-chip" disabled={busy || f.carrier_a_down} onClick={() => run('carrier_outage', 'Cellular carrier A outage', false)}>Carrier A outage</button>
          <button type="button" className="mesh-chip danger" disabled={busy} onClick={() => run('comms_restore', 'All injected comms faults removed', false)}>Restore all comms</button>
        </div>
        <p className="ch-msg" role="status" aria-live="polite">{msg}</p>
      </fieldset>
    </div>
  )
}
