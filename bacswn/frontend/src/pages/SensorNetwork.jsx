import { useCallback } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export default function SensorNetwork() {
  const { data, loading } = usePolling(useCallback(() => api.sensorGrid(), []), 60000)

  const stations = data?.stations || []
  const healthPct = data?.health_pct ?? 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Sensor Network</h2>
          <p className="subtitle">Weather station grid monitoring & health status</p>
        </div>
        <div className="live-badge"><div className="live-dot" /> LIVE</div>
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
                <div>
                  <span style={{color: 'var(--text-muted)'}}>Temp: </span>
                  {s.temp_c != null ? `${s.temp_c}°C` : '—'}
                </div>
                <div>
                  <span style={{color: 'var(--text-muted)'}}>Wind: </span>
                  {s.wind_speed_kt != null ? `${s.wind_speed_kt}kt` : '—'}
                </div>
                <div>
                  <span style={{color: 'var(--text-muted)'}}>Vis: </span>
                  {s.visibility_sm != null ? `${s.visibility_sm}SM` : '—'}
                </div>
                <div>
                  <span style={{color: 'var(--text-muted)'}}>Elev: </span>
                  {s.elevation_ft}ft
                </div>
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
