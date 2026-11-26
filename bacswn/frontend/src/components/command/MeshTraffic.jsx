/**
 * Mesh weather → air traffic. Map layers (hazard areas, predicted paths into
 * them) plus a panel that is their full text equivalent: every hazard and
 * every conflict, with the suggested heading change.
 *
 * Why: the mesh's value to air traffic is warning aircraft before they reach a
 * storm; the map shows it at a glance and the panel gives the same facts to
 * screen-reader users and anyone who needs exact values (WCAG 1.1.1).
 * How: both read the `airspace` picture from /api/mesh/airspace (hazards,
 * conflicts, horizon); map shapes are non-interactive so they never block
 * clicks on aircraft beneath.
 */
import { Circle, CircleMarker, Polyline } from 'react-leaflet'
import { compass } from '../compass'


/** Map colour per hazard kind (graphics only). */
const HZ_COLOR = { SQUALL: '#ef4444', TSRA: '#f59e0b', IFR: '#a855f7' }
/** Text colour per hazard kind: CSS variables with 4.5:1 contrast in both themes. */
const HZ_TEXT = { SQUALL: 'var(--hz-squall, var(--danger-text))', TSRA: 'var(--warning-text)', IFR: 'var(--cat-lifr-text)' }
/** Hazard verification status -> [label, badge class]. */
const STATUS = { confirmed: ['Confirmed', 'sev-severe'], detected: ['Detected', 'sev-moderate'], tracked: ['Tracked', 'sev-low'] }
/** Leaflet props for shapes that ignore the pointer. */
const quiet = { interactive: false, bubblingMouseEvents: false }

/**
 * Map layers: hazard circles (solid = confirmed, dashed = not yet verified) and,
 * per conflict, the predicted path to the entry point and a ring on the aircraft.
 * @param {{airspace: object|null}} props
 */
export function MeshHazardLayers({ airspace }) {
  if (!airspace) return null
  return (
    <>
      {airspace.hazards.map(h => (
        <Circle key={'mh-' + h.id} center={[h.lat, h.lon]} radius={h.radius_nm * 1852} {...quiet}
          pathOptions={{
            color: HZ_COLOR[h.kind], weight: h.status === 'confirmed' ? 3 : 2, fillColor: HZ_COLOR[h.kind],
            fillOpacity: h.status === 'confirmed' ? 0.25 : 0.12, dashArray: h.status === 'confirmed' ? null : '6 5',
          }} />
      ))}
      {airspace.conflicts.map(c => (
        <span key={'mc-' + c.icao24 + c.hazard_id}>
          <Polyline positions={[[c.lat, c.lon], c.entry_point]} {...quiet}
            pathOptions={{ color: '#f87171', weight: 3, dashArray: '2 6', opacity: 0.95 }} />
          <CircleMarker center={[c.lat, c.lon]} radius={16} {...quiet}
            pathOptions={{ color: c.severity === 'severe' ? '#ef4444' : '#f59e0b', weight: 3, fillOpacity: 0 }} />
        </span>
      ))}
    </>
  )
}

/**
 * Text panel: every predicted conflict (with advice) and every hazard area.
 * @param {{airspace: object|null}} props
 */
export default function MeshTrafficPanel({ airspace }) {
  if (!airspace) return null
  const { hazards, conflicts } = airspace
  const confirmed = hazards.filter(h => h.status === 'confirmed').length
  return (
    <section className="card mesh-traffic" aria-labelledby="mt-h">
      <div className="card-header">
        <h3 id="mt-h">Mesh weather → air traffic</h3>
        <span className="mt-sum">
          {hazards.length} hazard area{hazards.length === 1 ? '' : 's'} ({confirmed} confirmed) ·{' '}
          <b>{conflicts.length}</b> aircraft predicted to enter one in the next {airspace.horizon_min} min
        </span>
      </div>

      {conflicts.length === 0 ? (
        <p className="mt-dim">No aircraft are predicted to fly into a mesh hazard in the next {airspace.horizon_min} minutes.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Aircraft predicted to enter weather hazards">
          <table className="data-table mt-table">
            <caption className="sr-only">Aircraft predicted to enter a weather hazard, soonest first</caption>
            <thead><tr>
              <th scope="col">Aircraft</th><th scope="col">Hazard</th><th scope="col">Entry</th>
              <th scope="col">Hazard is</th><th scope="col">Advice</th>
            </tr></thead>
            <tbody>
              {conflicts.map(c => (
                <tr key={c.icao24 + c.hazard_id}>
                  <th scope="row">
                    {c.callsign}<small>{c.altitude_ft ? `${c.altitude_ft.toLocaleString()} ft` : ''} · {c.ground_speed_kt} kt · track {String(c.track).padStart(3, '0')}°{c.simulated ? ' · simulated' : ''}</small>
                  </th>
                  <td><b style={{ color: HZ_TEXT[c.hazard] }}>{c.hazard}</b> <small>{c.hazard_id}</small></td>
                  <td>{c.inside ? <b style={{ color: 'var(--danger-text)' }}>Inside now</b> : `in ${c.minutes_to_entry} min`}
                    <small>{c.distance_nm} nm {compass(c.bearing)}</small></td>
                  <td><span className={`mt-status ${STATUS[c.hazard_status][1]}`}>{STATUS[c.hazard_status][0]}</span></td>
                  <td>{c.advice.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="chart-data">
        <summary>Hazard areas ({hazards.length})</summary>
        {hazards.length === 0 ? <p className="mt-dim">None.</p> : (
          <ul className="mt-hazards">
            {hazards.map(h => (
              <li key={h.id}>
                <b style={{ color: HZ_TEXT[h.kind] }}>{h.kind}</b> {h.id} — <span className={`mt-status ${STATUS[h.status][1]}`}>{STATUS[h.status][0]}</span>{' '}
                {h.radius_nm} nm radius at {h.lat}°N {Math.abs(h.lon)}°W, moving {compass(h.heading)} {h.speed_kt} kt
                {h.low_level ? ', below 10,000 ft only' : ''}. <span className="mt-dim">{h.basis}.</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <p className="mt-dim mt-note">
        On the map: solid areas are confirmed by peer stations and satellite, dashed areas are not yet verified;
        red dotted lines show where an aircraft will enter. {airspace.note}
      </p>
    </section>
  )
}
