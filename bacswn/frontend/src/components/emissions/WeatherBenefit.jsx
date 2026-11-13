import { useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { api, saveBlob } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import ChartTable, { chartTextColor, summarise } from '../a11y/ChartTable'
import ChartActions from '../share/ChartActions'
import { useUrlState, oneOf } from '../share/useUrlState'

const WINDOWS = [7, 30, 90]
const STATUS_LABEL = { confirmed: 'Confirmed by peers', detected: 'Detected, not yet verified', tracked: 'Tracked by radar / satellite' }
const fmt = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }))
const tonnes = (kg) => (kg == null ? '—' : kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : `${fmt(kg)} kg`)

/**
 * Fuel and CO₂ saved because the mesh warned aircraft about storms before
 * their own weather radar could: an early, gentle reroute instead of a late,
 * sharp one. Estimates from services/weather_benefit.py.
 */
export default function WeatherBenefit() {
  const [days, setDays] = useUrlState('days', 30, oneOf(WINDOWS))
  const { data: d } = usePolling(useCallback(() => api.weatherBenefit(days), [days]), 30000)
  const tick = chartTextColor()

  const daily = d?.daily || []
  const dLabels = daily.map(x => x.date)
  const dValues = daily.map(x => x.saved_co2_kg)
  const sKeys = Object.keys(STATUS_LABEL)
  const sLabels = sKeys.map(k => STATUS_LABEL[k])
  const sValues = sKeys.map(k => d?.by_status?.[k]?.saved_co2_kg ?? 0)
  const a = d?.assumptions
  const axis = { y: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { color: tick }, title: { display: true, text: 'kg CO₂', color: tick } },
                 x: { grid: { display: false }, ticks: { color: tick } } }

  return (
    <section className="card wb" aria-labelledby="wb-h" id="wx-benefit" style={{ marginBottom: 16 }}>
      <div className="card-header wb-head">
        <h3 id="wb-h">Fuel &amp; CO₂ saved by early storm warnings</h3>
        <label className="wb-window">Period{' '}
          <select value={days} onChange={e => setDays(Number(e.target.value))}>
            {WINDOWS.map(w => <option key={w} value={w}>Last {w} days</option>)}
          </select>
        </label>
      </div>
      <p className="wb-intro">
        The mesh warns aircraft about storm cores and fog banks up to 30 minutes ahead, before the crew can see them
        on the aircraft's own weather radar. Starting the detour early makes it shorter. This ledger estimates the
        track, fuel and CO₂ that saves for every aircraft the mesh warned.
      </p>

      <div className="card-grid wb-stats">
        <div className="stat-card"><span className="stat-label">CO₂ saved</span>
          <span className="stat-value success">{tonnes(d?.saved_co2_kg)}</span>
          <span className="stat-detail">{d ? `last ${d.days} days` : ''}</span></div>
        <div className="stat-card"><span className="stat-label">Fuel saved</span>
          <span className="stat-value info">{tonnes(d?.saved_fuel_kg)}</span>
          <span className="stat-detail">{fmt(d?.saved_nm, 1)} nm less flying</span></div>
        <div className="stat-card"><span className="stat-label">Early reroutes</span>
          <span className="stat-value accent">{fmt(d?.reroutes)}</span>
          <span className="stat-detail">of {fmt(d?.warnings)} storm warnings{d?.hold_or_divert ? `; ${fmt(d.hold_or_divert)} hold/divert (not credited)` : ''}</span></div>
        <div className="stat-card"><span className="stat-label">At this rate, per year</span>
          <span className="stat-value">{d?.annualised_co2_t != null ? `${fmt(d.annualised_co2_t, 1)} t` : '—'}</span>
          <span className="stat-detail">{d?.annualised_co2_t != null ? `from ${fmt(d.monitored_hours, 1)} h monitored` : 'needs at least 1 hour monitored'}</span></div>
      </div>

      <div className="grid-2">
        <div id="chart-wx-benefit-daily" className="wb-chart">
          <h4>CO₂ saved per day</h4>
          {daily.length === 0 ? <p className="wb-empty">No early reroutes recorded in this period yet.</p> : (
            <Bar aria-label={`Bar chart, CO₂ saved per day in kilograms: ${summarise(dLabels, dValues, ' kg')}`}
              data={{ labels: dLabels, datasets: [{ label: 'CO₂ saved (kg)', data: dValues, backgroundColor: '#10b981', borderRadius: 4 }] }}
              options={{ responsive: true, plugins: { legend: { display: false } }, scales: axis }} />
          )}
          <ChartTable caption="CO₂ saved per day by early storm warnings" labels={dLabels} labelHeader="Date"
            series={[{ name: 'CO₂ saved', values: dValues }, { name: 'Fuel saved', values: daily.map(x => x.saved_fuel_kg) },
                     { name: 'Reroutes', values: daily.map(x => x.reroutes) }]}
            unit="" shareId="chart-wx-benefit-daily" filename={`co2-saved-per-day-${days}d`} />
        </div>
        <div id="chart-wx-benefit-status" className="wb-chart">
          <h4>CO₂ saved, by how sure the mesh was</h4>
          <Bar aria-label={`Bar chart, CO₂ saved by hazard status in kilograms: ${summarise(sLabels, sValues, ' kg')}`}
            data={{ labels: sLabels, datasets: [{ label: 'CO₂ saved (kg)', data: sValues, backgroundColor: ['#10b981', '#f59e0b', '#3b82f6'], borderRadius: 4 }] }}
            options={{ responsive: true, plugins: { legend: { display: false } }, scales: axis }} />
          <ChartTable caption="CO₂ saved by hazard status" labels={sLabels} labelHeader="Hazard status"
            series={[{ name: 'CO₂ saved (kg)', values: sValues }, { name: 'Reroutes', values: sKeys.map(k => d?.by_status?.[k]?.reroutes ?? 0) }]}
            shareId="chart-wx-benefit-status" filename={`co2-saved-by-status-${days}d`} />
        </div>
      </div>

      <div id="wx-benefit-ledger">
        <h4 id="wb-ledger-h">Most recent warnings</h4>
        {(d?.recent || []).length === 0 ? <p className="wb-empty">None yet. Warnings are logged while the live airspace picture is running (Command Center or Flight Ops open).</p> : (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="wb-ledger-h">
            <table className="data-table">
              <thead><tr>
                <th scope="col">Time (UTC)</th><th scope="col">Flight</th><th scope="col">Hazard</th><th scope="col">Warning</th>
                <th scope="col">Extra track: early / late</th><th scope="col">CO₂ saved</th>
              </tr></thead>
              <tbody>{d.recent.map(r => (
                <tr key={r.id}>
                  <td>{r.recorded_at.slice(5, 16).replace('T', ' ')}</td>
                  <th scope="row">{r.callsign || r.icao24}{r.simulated ? <small className="wb-dim"> (simulated)</small> : null}</th>
                  <td>{r.hazard_kind} · {r.hazard_status}</td>
                  <td>{r.lead_min} min / {fmt(r.lead_nm)} nm ahead</td>
                  <td>{r.credited ? `${fmt(r.early_extra_nm, 1)} / ${fmt(r.baseline_extra_nm, 1)} nm` : <span className="wb-dim">{r.reason}</span>}</td>
                  <td>{r.credited ? (r.saved_co2_kg < 1 ? '<1 kg' : `${fmt(r.saved_co2_kg)} kg`) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <ChartActions id="wx-benefit-ledger" title="Weather-benefit ledger" filename={`weather-benefit-${days}d`}
          onDownload={async () => saveBlob(await api.weatherBenefitCsv(days), `weather-benefit-${days}d.csv`)} />
      </div>

      <details className="wb-method">
        <summary>How this is calculated</summary>
        <ul>
          <li>For each warned aircraft, the sideways distance it must move to clear the hazard is the hazard radius plus a
            5 nm buffer, minus how far its present track already passes from the centre.</li>
          <li><b>With BACSWN</b> the detour starts when the warning arrives (credited up to {fmt(a?.max_lead_nm)} nm ahead).
            <b> Without it</b>, the crew starts deviating when the cell is {fmt(a?.baseline_decision_nm)} nm ahead on the
            aircraft's own radar. A detour reaching offset <i>y</i> over distance <i>a</i> and returning adds 2 × (√(a² + y²) − a) nm.</li>
          <li>Track saved ÷ ground speed × fuel burn for the aircraft category gives fuel; × {a?.co2_per_kg_fuel ?? 3.16} gives CO₂.</li>
          <li>Only lateral reroutes count. Warnings that call for holding or diverting, and aircraft already inside a hazard,
            earn no credit, although avoided holds and diversions are where the largest real savings are. So the figure is conservative.</li>
          <li>{d?.note}</li>
        </ul>
      </details>
    </section>
  )
}
