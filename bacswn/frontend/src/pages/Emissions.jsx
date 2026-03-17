import { useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function Emissions() {
  const { data: emData, loading } = usePolling(useCallback(() => api.currentEmissions(), []), 60000)
  const { data: summaryData } = usePolling(useCallback(() => api.emissionsSummary(), []), 60000)

  const emissions = emData || {}
  const summary = summaryData || {}
  const flights = emissions.flights || []
  const compliance = summary.compliance || {}
  const categories = summary.categories || {}

  const categoryChartData = {
    labels: Object.keys(categories).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
    datasets: [{
      label: 'Flights',
      data: Object.values(categories),
      backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
      borderRadius: 6,
    }],
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Carbon & Emissions Dashboard</h2>
          <p className="subtitle">ICAO CORSIA compliance monitoring — real-time</p>
        </div>
        <div className="live-badge"><div className="live-dot" /> LIVE</div>
      </div>

      {/* KPIs */}
      <div className="card-grid" style={{marginBottom: 16}}>
        <div className="stat-card">
          <span className="stat-label">Total CO2</span>
          <span className="stat-value warning">{emissions.total_co2_tonnes ?? '—'}</span>
          <span className="stat-detail">tonnes (current airspace)</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Fuel Burn</span>
          <span className="stat-value info">{emissions.total_fuel_burn_kg ? Math.round(emissions.total_fuel_burn_kg).toLocaleString() : '—'}</span>
          <span className="stat-detail">kg estimated</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Monitored Flights</span>
          <span className="stat-value accent">{emissions.total_flights ?? '—'}</span>
          <span className="stat-detail">{compliance.monitoring_coverage_pct ?? 100}% coverage</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CORSIA Status</span>
          <span className="stat-value success">{compliance.compliance_status?.toUpperCase() ?? 'COMPLIANT'}</span>
          <span className="stat-detail">Real-time monitoring</span>
        </div>
      </div>

      {/* Charts */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16}}>
        <div className="card">
          <div className="card-header"><h3>Flights by Aircraft Category</h3></div>
          <Bar data={categoryChartData} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#1e293b' } }, x: { grid: { display: false } } },
          }} />
        </div>
        <div className="card">
          <div className="card-header"><h3>CORSIA Compliance Summary</h3></div>
          <div style={{padding: 16}}>
            <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)'}}>
              <span style={{color: 'var(--text-secondary)'}}>CORSIA Applicable Flights</span>
              <strong>{compliance.corsia_applicable_flights ?? '—'}</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)'}}>
              <span style={{color: 'var(--text-secondary)'}}>Monitoring Coverage</span>
              <strong style={{color: 'var(--success)'}}>{compliance.monitoring_coverage_pct ?? 100}%</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)'}}>
              <span style={{color: 'var(--text-secondary)'}}>Emission Factor</span>
              <strong>3.16 kg CO2/kg fuel</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)'}}>
              <span style={{color: 'var(--text-secondary)'}}>Methodology</span>
              <strong>ICAO CORSIA</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0'}}>
              <span style={{color: 'var(--text-secondary)'}}>Reporting Period</span>
              <strong>{compliance.reporting_period ?? 'Real-time'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Per-flight emissions table */}
      <div className="card">
        <div className="card-header"><h3>Per-Flight Emissions</h3></div>
        <div style={{overflowX: 'auto'}}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Callsign</th>
                <th>Category</th>
                <th>Fuel Burn (kg)</th>
                <th>CO2 (kg)</th>
                <th>CO2 (tonnes)</th>
                <th>Methodology</th>
              </tr>
            </thead>
            <tbody>
              {flights.slice(0, 30).map((f, i) => (
                <tr key={i}>
                  <td style={{fontWeight: 600}}>{f.callsign || '—'}</td>
                  <td><span className="cat-badge cat-MVFR">{f.aircraft_category}</span></td>
                  <td>{f.fuel_burn_kg?.toLocaleString()}</td>
                  <td>{f.co2_kg?.toLocaleString()}</td>
                  <td>{f.co2_tonnes}</td>
                  <td style={{color: 'var(--text-muted)'}}>{f.methodology}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
