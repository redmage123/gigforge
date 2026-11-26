/**
 * Sensor Network page.
 *
 * What: health overview and per-station cards for the Bahamas weather-station grid.
 * Why: lets forecasters see at a glance which stations are reporting and what they observe.
 * How: polls `api.sensorGrid()` every 60 s; renders four summary stat cards (total,
 * operational, no data, network health %) and one card per station with its latest
 * temperature, wind, visibility, elevation, flight category and position.
 */
import { useCallback } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import LiveBadge from '../components/LiveBadge'

/**
 * A muted "Label: " prefix followed by a value, used for each reading on a station card.
 * @param {{label: string, children: React.ReactNode}} props
 */
function StationMetric({ label, children }) {
  return (
    <div>
      <span style={{color: 'var(--text-muted)'}}>{label}: </span>
      {children}
    </div>
  )
}

/** Station-grid health dashboard, refreshed every minute. */
export default function SensorNetwork() {
  const { data } = usePolling(useCallback(() => api.sensorGrid(), []), 60000)

  const stations = data?.stations || []
  const healthPct = data?.health_pct ?? 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Sensor Network</h2>
          <p className="subtitle">Weather station grid monitoring & health status</p>
        </div>
        <LiveBadge />
      </div>

      {/* Overview */}
      <div className="card-grid" style={{marginBottom: 16}}>
        <div className="stat-card">
          <span className="stat-label">Total Stations</span>
          <span className="stat-value accent">{data?.total ?? 15}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Operational</span>
          <span className="stat-value success">{data?.operational ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">No Data</span>
          <span className="stat-value warning">{data?.no_data ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Network Health</span>
          <span className={`stat-value ${healthPct > 80 ? 'success' : healthPct > 50 ? 'warning' : 'danger'}`}>{healthPct}%</span>
        </div>
      </div>

      {/* Station Grid */}
      <div className="card">
        <div className="card-header"><h3>Station Grid</h3></div>
        <div className="card-grid">
          {stations.map(s => (
            <div key={s.icao_code} className="stat-card" style={{
              padding: 16,
              borderLeft: `4px solid ${s.status === 'operational' ? 'var(--success)' : 'var(--warning)'}`,
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                <strong style={{fontSize: 16}}>{s.icao_code}</strong>
                <span className={`cat-badge cat-${s.flight_category}`}>{s.flight_category}</span>
              </div>
              <div style={{fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8}}>{s.name}</div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13}}>
                <StationMetric label="Temp">{s.temp_c != null ? `${s.temp_c}°C` : '—'}</StationMetric>
                <StationMetric label="Wind">{s.wind_speed_kt != null ? `${s.wind_speed_kt}kt` : '—'}</StationMetric>
                <StationMetric label="Vis">{s.visibility_sm != null ? `${s.visibility_sm}SM` : '—'}</StationMetric>
                <StationMetric label="Elev">{s.elevation_ft}ft</StationMetric>
              </div>
              <div style={{marginTop: 8, fontSize: 11, color: 'var(--text-muted)'}}>
                {s.lat.toFixed(3)}°N, {Math.abs(s.lon).toFixed(3)}°W | {s.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
