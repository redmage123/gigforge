/**
 * Carbon & Emissions dashboard.
 *
 * What: live CORSIA emissions view of the current airspace: KPI cards, the weather-routing
 * benefit panel, flights by aircraft category, a compliance summary and a per-flight table.
 * Why: gives the CAA real-time visibility of aviation CO2 under ICAO CORSIA, and links on to
 * the CORSIA Oversight page and the external Carbon Desk.
 * How: polls `api.currentEmissions()` and `api.emissionsSummary()` every 60 s. The category
 * chart (Chart.js) is paired with an accessible ChartTable data-table alternative.
 */
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import ChartTable, { chartTextColor, summarise } from '../components/a11y/ChartTable'
import LiveBadge from '../components/LiveBadge'
import WeatherBenefit from '../components/emissions/WeatherBenefit'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

/** How each CORSIA register status from /api/emissions/summary is shown (label and stat colour). */
const CORSIA_STATUS = {
  compliant: { label: 'COMPLIANT', tone: 'success' },
  under_review: { label: 'UNDER REVIEW', tone: 'warning' },
  shortfall: { label: 'SHORTFALL', tone: 'danger' },
  no_operators: { label: 'NO OPERATORS', tone: 'info' },
  unknown: { label: 'UNKNOWN', tone: 'info' },
}

/**
 * One label/value line of the CORSIA compliance summary card.
 * @param {object} props
 * @param {string} props.label left-hand label
 * @param {React.ReactNode} props.children the (bold) value
 * @param {object} [props.valueStyle] extra style for the value
 * @param {boolean} [props.last] omit the bottom divider on the final row
 */
function SummaryRow({ label, children, valueStyle, last = false }) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', ...(last ? {} : {borderBottom: '1px solid var(--border)'})}}>
      <span style={{color: 'var(--text-secondary)'}}>{label}</span>
      <strong style={valueStyle}>{children}</strong>
    </div>
  )
}

/** Real-time CORSIA emissions dashboard for flights in the Bahamas FIR. */
export default function Emissions() {
  const { data: emData } = usePolling(useCallback(() => api.currentEmissions(), []), 60000)
  const { data: summaryData } = usePolling(useCallback(() => api.emissionsSummary(), []), 60000)

  const emissions = emData || {}
  const summary = summaryData || {}
  const flights = emissions.flights || []
  const compliance = summary.compliance || {}
  const statusView = CORSIA_STATUS[compliance.compliance_status] || CORSIA_STATUS.unknown
  const categories = summary.categories || {}

  const catLabels = Object.keys(categories).map(k => k.charAt(0).toUpperCase() + k.slice(1))
  const tickColor = chartTextColor()
  const categoryChartData = {
    labels: catLabels,
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
        <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
          <Link to="/corsia-oversight" className="btn btn-primary btn-sm" style={{textDecoration: 'none'}}><span aria-hidden="true">📒</span> CORSIA Oversight</Link>
          <a href="https://assetadvisor.ai-elevate.ai/carbon-desk" target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{textDecoration: 'none'}}
            title="The Carbon Desk (offset futures trading) is now part of AssetAdvisor"><span aria-hidden="true">💹</span> Hedge on Carbon Desk (AssetAdvisor)<span className="sr-only"> (opens in a new tab)</span> <span aria-hidden="true">↗</span></a>
          <LiveBadge />
        </div>
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
          <span className="stat-detail">{compliance.monitoring_coverage_pct != null ? `${compliance.monitoring_coverage_pct}% with known aircraft type` : '—'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CORSIA Status</span>
          <span className={`stat-value ${statusView.tone}`}>{statusView.label}</span>
          <span className="stat-detail">{compliance.compliance_period ? `Oversight register, ${compliance.compliance_period}` : 'From the oversight register'}</span>
        </div>
      </div>

      <WeatherBenefit />

      {/* Charts */}
      <div className="grid-2" style={{marginBottom: 16}}>
        <div className="card" id="chart-flight-categories">
          <div className="card-header"><h3>Flights by Aircraft Category</h3></div>
          <Bar data={categoryChartData} aria-label={`Bar chart, monitored flights by aircraft category: ${summarise(catLabels, Object.values(categories))}`} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { color: tickColor } }, x: { grid: { display: false }, ticks: { color: tickColor } } },
          }} />
          <ChartTable caption="Monitored flights by aircraft category" labels={catLabels}
            series={[{ name: 'Flights', values: Object.values(categories) }]}
            shareId="chart-flight-categories" filename="flights-by-category" labelHeader="Aircraft category" />
        </div>
        <div className="card">
          <div className="card-header"><h3>CORSIA Compliance Summary</h3></div>
          <div style={{padding: 16}}>
            <SummaryRow label="CORSIA Applicable Flights">{compliance.corsia_applicable_flights ?? '—'}</SummaryRow>
            <SummaryRow label="Aircraft Type Known">{compliance.monitoring_coverage_pct != null ? `${compliance.monitoring_coverage_pct}%` : '—'}</SummaryRow>
            <SummaryRow label="Emission Factor">3.16 kg CO2/kg fuel</SummaryRow>
            <SummaryRow label="Methodology">ICAO CORSIA</SummaryRow>
            <SummaryRow label="Reporting Period" last>{compliance.reporting_period ?? 'Real-time'}</SummaryRow>
          </div>
        </div>
      </div>

      {/* Per-flight emissions table */}
      <div className="card">
        <div className="card-header"><h3 id="per-flight-h">Per-Flight Emissions</h3></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="per-flight-h">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Callsign</th>
                <th scope="col">Category</th>
                <th scope="col">Fuel Burn (kg)</th>
                <th scope="col">CO₂ (kg)</th>
                <th scope="col">CO₂ (tonnes)</th>
                <th scope="col">Methodology</th>
              </tr>
            </thead>
            <tbody>
              {flights.slice(0, 30).map((f, i) => (
                <tr key={i}>
                  <th scope="row" style={{fontWeight: 600}}>{f.callsign || '—'}</th>
                  <td><span className="cat-badge cat-MVFR">{f.aircraft_category}</span></td>
                  <td>{f.fuel_burn_kg?.toLocaleString()}</td>
                  <td>{f.co2_kg?.toLocaleString()}</td>
                  <td>{f.co2_tonnes}</td>
                  <td style={{color: 'var(--text-secondary)'}}>{f.methodology}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
