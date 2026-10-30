/**
 * Text equivalent of everything on the Command Center map (WCAG 1.1.1): stations,
 * aircraft, SIGMETs and cyclones as accessible tables. Useful for screen-reader,
 * magnifier and keyboard users, and for anyone who wants exact values.
 */
const CATEGORY_TEXT = { VFR: 'VFR', MVFR: 'Marginal VFR', IFR: 'IFR', LIFR: 'Low IFR' }

export default function SituationTables({ stations, flights, sigmets, hurricanes }) {
  const sortedFlights = [...flights].sort((a, b) => (a.callsign || a.icao24).localeCompare(b.callsign || b.icao24))
  return (
    <details className="card situation-tables">
      <summary>
        <span>Map data as tables</span>
        <small>{stations.length} stations · {flights.length} aircraft · {sigmets.length} SIGMETs · {hurricanes.length} cyclones</small>
      </summary>

      <h3 id="sit-stations">Weather stations</h3>
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="sit-stations">
        <table className="data-table">
          <thead><tr>
            <th scope="col">ICAO</th><th scope="col">Station</th><th scope="col">Flight category</th><th scope="col">Source</th>
            <th scope="col">Wind</th><th scope="col">Visibility</th><th scope="col">Temp</th><th scope="col">METAR</th>
          </tr></thead>
          <tbody>
            {stations.map(s => (
              <tr key={s.icao}>
                <th scope="row">{s.icao}</th>
                <td>{s.name}</td>
                <td>{CATEGORY_TEXT[s.flight_category] || 'Unavailable'}</td>
                <td>{s.source === 'metar' ? 'Observed (METAR)' : s.source === 'model' ? 'Model estimate' : 'No data'}</td>
                <td>{s.wind_speed_kt != null ? `${s.wind_dir_deg != null ? s.wind_dir_deg + '° ' : ''}${s.wind_speed_kt} kt${s.wind_gust_kt ? ' gusting ' + s.wind_gust_kt : ''}` : '—'}</td>
                <td>{s.visibility_sm != null ? `${s.visibility_sm} SM` : '—'}</td>
                <td>{s.temp_c != null ? `${s.temp_c} °C` : '—'}</td>
                <td><code>{s.raw_metar || '—'}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 id="sit-aircraft">Aircraft in the FIR</h3>
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="sit-aircraft">
        <table className="data-table">
          <thead><tr>
            <th scope="col">Callsign</th><th scope="col">Altitude</th><th scope="col">Speed</th>
            <th scope="col">Heading</th><th scope="col">Vertical</th><th scope="col">Origin</th>
          </tr></thead>
          <tbody>
            {sortedFlights.map(f => (
              <tr key={f.icao24}>
                <th scope="row">{f.callsign || f.icao24}</th>
                <td>{f.altitude ? `${Math.round(f.altitude * 3.281).toLocaleString()} ft` : 'On ground'}</td>
                <td>{f.velocity ? `${Math.round(f.velocity * 1.944)} kt` : '—'}</td>
                <td>{f.track != null ? `${Math.round(f.track)}°` : '—'}</td>
                <td>{f.vertical_rate ? `${f.vertical_rate > 0 ? 'Climbing' : 'Descending'} ${Math.abs(Math.round(f.vertical_rate * 196.85))} fpm` : 'Level'}</td>
                <td>{f.origin_country || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>SIGMETs</h3>
      {sigmets.length === 0 ? <p>No active SIGMETs.</p> : (
        <ul className="situation-list">
          {sigmets.map((s, i) => (
            <li key={i}><strong>{s.hazard_name || s.hazard}</strong> — {s.severity}, FL{s.fl_base}–FL{s.fl_top}
              {s.valid_to ? `, valid to ${s.valid_to.slice(11, 16)}Z` : ''}{s.raw_text ? <><br /><code>{s.raw_text}</code></> : null}</li>
          ))}
        </ul>
      )}

      <h3>Tropical cyclones</h3>
      {hurricanes.length === 0 ? <p>No active tropical cyclones.</p> : (
        <ul className="situation-list">
          {hurricanes.map(h => (
            <li key={h.id}><strong>{h.name}</strong> — {h.classification}, {h.wind_mph} mph, {h.pressure_mb} mb, moving {h.movement}</li>
          ))}
        </ul>
      )}
    </details>
  )
}
