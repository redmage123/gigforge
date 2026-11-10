import Dialog from '../a11y/Dialog'

/**
 * Details for one operational alert. Flight alerts (an aircraft predicted to enter,
 * or already inside, a mesh hazard) get the full picture: the advice, the aircraft,
 * the hazard, the encounter geometry and why the alert has its severity. While the
 * mesh still predicts the conflict the dialog shows the latest values (refreshed
 * every few seconds); once it no longer does, it says so and shows the values from
 * when the alert was raised.
 */

const SEVERITY_LABEL = { severe: 'SEVERE', high: 'HIGH', moderate: 'MODERATE', low: 'ADVISORY' }
const HAZARD_KIND = {
  SQUALL: 'Squall line: a band of severe thunderstorms with strong gusts, turbulence and heavy rain.',
  TSRA: 'Thunderstorm with rain: turbulence, wind shear, lightning and possible hail.',
  IFR: 'Low cloud or poor visibility (instrument conditions), affecting flight below 10,000 ft.',
}
const HAZARD_STATUS = {
  confirmed: 'Confirmed: verified by neighbouring stations and satellite.',
  detected: 'Detected: reported by the mesh, not yet independently verified.',
  tracked: 'Tracked: the mesh is following the cell, not yet verified.',
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = (d) => COMPASS[Math.round(((d % 360) + 360) % 360 / 45) % 8]
const pos = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
const hdg = (d) => String(Math.round(((d % 360) + 360) % 360)).padStart(3, '0') + '°'
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

function severityReason(c) {
  if (c.inside) return `${c.severity === 'severe' ? 'Severe' : 'High'}: the aircraft is already inside the ${c.hazard_status === 'confirmed' ? 'confirmed ' : ''}hazard.`
  if (c.severity === 'severe') return 'Severe: entry within 10 minutes into a confirmed hazard.'
  if (c.severity === 'high') return 'High: entry within 15 minutes.'
  return 'Moderate: entry predicted within the 30-minute look-ahead.'
}

function Facts({ rows }) {
  return (
    <dl className="ad-facts">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}

function HazardFacts({ h }) {
  return (
    <Facts rows={[
      ['Type', <><b>{h.kind}</b> — {HAZARD_KIND[h.kind] || h.kind}</>],
      ['Hazard ID', h.id],
      ['Verification', HAZARD_STATUS[h.status] || h.status],
      h.basis && ['Basis', h.basis],
      ['Centre', pos(h.lat, h.lon)],
      ['Size', `${h.radius_nm} nm radius`],
      ['Movement', `${compass(h.heading)} (${hdg(h.heading)}) at ${h.speed_kt} kt`],
      h.low_level && ['Altitude', 'Below 10,000 ft only'],
      h.stations?.length > 0 && ['Stations covering it', h.stations.join(', ')],
    ]} />
  )
}

function FlightDetails({ alert, airspace }) {
  const snap = alert.conflict
  const live = airspace?.conflicts?.find(c => c.icao24 === snap.icao24 && c.hazard_id === snap.hazard_id)
  const c = live || snap
  const h = airspace?.hazards?.find(x => x.id === c.hazard_id) || alert.hazard

  return (
    <>
      <p className={`ad-status ${live ? 'is-live' : 'is-stale'}`} role="status">
        {live
          ? 'Live: still predicted by the mesh. Values update every few seconds.'
          : 'No longer predicted: the aircraft has cleared the hazard, changed course or left the area. Values below are from when the alert was raised.'}
      </p>

      <p className="ad-lead">
        <b>{c.callsign}</b>{' '}
        {c.inside
          ? <>is <b>inside</b> {c.hazard} area {c.hazard_id}.</>
          : <>is predicted to enter {c.hazard} area {c.hazard_id} in <b>{c.minutes_to_entry} min</b>.</>}
      </p>

      <div className={`ad-advice sev-${c.severity}`}>
        <span className="ad-advice-k">Advice</span>
        <span>{c.advice.text}</span>
      </div>

      <h4>Aircraft</h4>
      <Facts rows={[
        ['Callsign', c.callsign],
        c.icao24 && ['ICAO address', <span className="mono">{c.icao24}</span>],
        ['Position', pos(c.lat, c.lon)],
        ['Altitude', c.altitude_ft ? `${c.altitude_ft.toLocaleString()} ft` : 'Not reported'],
        ['Ground speed', `${c.ground_speed_kt} kt`],
        ['Track', hdg(c.track)],
        ['Data source', c.simulated ? 'Simulated traffic (live feed unavailable)' : 'Live surveillance feed'],
      ]} />

      <h4>Encounter</h4>
      <Facts rows={[
        ['Time to entry', c.inside ? 'Inside now' : `${c.minutes_to_entry} min`],
        !c.inside && c.entry_point && ['Entry point', pos(c.entry_point[0], c.entry_point[1])],
        ['Hazard centre', `${c.distance_nm} nm ${compass(c.bearing)} (bearing ${hdg(c.bearing)})`],
        c.advice.heading != null && ['Suggested heading', hdg(c.advice.heading)],
        ['Severity', severityReason(c)],
      ]} />

      <h4>Hazard</h4>
      {h ? <HazardFacts h={h} /> : <p className="mt-dim">Hazard {c.hazard_id} is no longer reported by the mesh.</p>}
    </>
  )
}

function HazardDetails({ alert, airspace }) {
  const h = airspace?.hazards?.find(x => x.id === alert.hazard.id)
  const affected = (airspace?.conflicts || []).filter(c => c.hazard_id === alert.hazard.id)
  return (
    <>
      <p className={`ad-status ${h ? 'is-live' : 'is-stale'}`} role="status">
        {h ? 'Live: the mesh still reports this hazard.' : 'No longer reported by the mesh. Values below are from when the alert was raised.'}
      </p>
      <h4>Hazard</h4>
      <HazardFacts h={h || alert.hazard} />
      <h4>Aircraft affected ({affected.length})</h4>
      {affected.length === 0 ? <p className="mt-dim">No aircraft are currently predicted to enter it.</p> : (
        <ul className="ad-list">
          {affected.map(c => (
            <li key={c.icao24}>
              <b>{c.callsign}</b> — {c.inside ? 'inside now' : `enters in ${c.minutes_to_entry} min`}. {c.advice.text}.
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function AlertDetails({ alert, airspace, onClose, onDismiss, onLocate }) {
  if (!alert) return <Dialog open={false} title="" onClose={onClose} />
  const where = alert.conflict
    ? (airspace?.conflicts?.find(c => c.icao24 === alert.conflict.icao24 && c.hazard_id === alert.conflict.hazard_id) || alert.conflict)
    : alert.hazard ? (airspace?.hazards?.find(x => x.id === alert.hazard.id) || alert.hazard) : null

  const actions = (
    <>
      {where && onLocate && (
        <button type="button" className="btn btn-sm" onClick={() => onLocate(where)}>Show on map</button>
      )}
      {!alert.dismissed && (
        <button type="button" className="btn btn-sm" onClick={() => onDismiss(alert.id)}>Dismiss alert</button>
      )}
    </>
  )

  return (
    <Dialog open title={alert.title} onClose={onClose} actions={actions}>
      <p className="ad-meta">
        <span className={`alert-sev sev-${alert.severity}`}>{SEVERITY_LABEL[alert.severity] || 'ALERT'}</span>
        <span>Raised {fmtTime(alert.time)} · {alert.source}{alert.dismissed ? ' · Dismissed' : ''}</span>
      </p>
      {alert.conflict ? <FlightDetails alert={alert} airspace={airspace} />
        : alert.hazard ? <HazardDetails alert={alert} airspace={airspace} />
        : <p>{alert.detail}</p>}
    </Dialog>
  )
}
