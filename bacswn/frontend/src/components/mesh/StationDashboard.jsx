import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import { usePolling } from '../../hooks/usePolling'
import { hz } from './PrecogChamber'

/**
 * Per-station dashboard: the station's ground sensor network, the (simulated)
 * Tomorrow.io satellite products it uses for decisions, and — separately — the
 * real current conditions from Tomorrow.io's API when a key is configured.
 */

const STATUS = { OK: ['OK', 'green'], STALE: ['Stale', 'amber'], SUSPECT: ['Suspect', 'red'], OFFLINE: ['Offline', 'grey'] }
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v)

/** Trend line; the numbers it shows are also given as text beside it. */
function Sparkline({ values }) {
  if (!values || values.length < 2) return null
  const lo = Math.min(...values), hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${22 - ((v - lo) / span) * 20}`).join(' ')
  return (
    <svg className="sd-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function trendText(values, unit) {
  if (!values || values.length < 2) return 'not enough data yet'
  const first = values[0], last = values[values.length - 1]
  const lo = Math.min(...values), hi = Math.max(...values)
  const dir = Math.abs(last - first) < (hi - lo) * 0.15 || hi === lo ? 'steady' : last > first ? 'rising' : 'falling'
  return `${dir}, ${fmt(lo)}–${fmt(hi)} ${unit} over ${values.length * 5} min`
}

function SensorNetwork({ sensors, metrics, station }) {
  const counts = Object.fromEntries(Object.keys(STATUS).map(k => [k, sensors.filter(s => s.status === k).length]))
  return (
    <section className="sd-panel sd-sensors" aria-labelledby="sd-sensors-h">
      <div className="sd-panel-head">
        <h4 id="sd-sensors-h">Ground sensor network</h4>
        <p>{sensors.length} sensors · {counts.OK} OK{counts.STALE ? ` · ${counts.STALE} stale` : ''}{counts.SUSPECT ? ` · ${counts.SUSPECT} suspect` : ''}{counts.OFFLINE ? ` · ${counts.OFFLINE} offline` : ''}</p>
      </div>
      <div className="table-scroll" role="region" aria-label={`${station} sensor network readings`} tabIndex={0}>
        <table className="sd-table">
          <thead><tr>
            <th scope="col">Sensor</th><th scope="col">Status</th><th scope="col">Readings</th>
            <th scope="col">Trend (2 h)</th><th scope="col">Health</th>
          </tr></thead>
          <tbody>
            {sensors.map(s => {
              const [label, tone] = STATUS[s.status] || [s.status, 'grey']
              const [pLabel, pUnit] = metrics[s.primary] || [s.primary, '']
              return (
                <tr key={s.id} className={s.status === 'SUSPECT' ? 'sd-suspect' : ''}>
                  <th scope="row">
                    {s.type}<small>{s.id}{s.distance_km > 1 ? ` · ${s.distance_km} km out` : ''}</small>
                  </th>
                  <td>
                    <span className={`mbadge ${tone}`}>{label}</span>
                    {s.flag && <small className="sd-flag">{s.flag}</small>}
                    {s.injected_fault && <small className="sd-truth">Presenter: {s.injected_fault} fault injected</small>}
                  </td>
                  <td>
                    <dl className="sd-readings">
                      {Object.entries(s.readings).map(([m, v]) => {
                        const [ml, mu] = metrics[m] || [m, '']
                        return <div key={m}><dt>{ml}</dt><dd>{fmt(v)}{mu && v != null && typeof v === 'number' ? ` ${mu}` : ''}</dd></div>
                      })}
                      {!Object.keys(s.readings).length && <div><dt>No data</dt><dd>—</dd></div>}
                    </dl>
                  </td>
                  <td className="sd-trend">
                    <Sparkline values={s.history[s.primary]} />
                    <small>{pLabel}: {trendText(s.history[s.primary], pUnit)}</small>
                  </td>
                  <td className="sd-health"><small>
                    Battery {s.battery_pct}%<br />Signal {s.rssi_dbm} dBm<br />
                    {s.report_age_min == null ? 'No report yet' : s.report_age_min === 0 ? 'Reported now' : `Reported ${s.report_age_min} min ago`}
                  </small></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Product({ title, obs, children }) {
  return (
    <div className="sd-product">
      <div className="sd-product-head">
        <b>{title}</b>
        {obs ? <span className={`mbadge ${obs.fresh ? 'green' : 'grey'}`}>{obs.fresh ? 'Fresh' : 'Too old to use'}</span>
          : <span className="mbadge grey">No pass yet</span>}
      </div>
      {obs && <small className="sd-dim">Pass {obs.age_min} min ago ({obs.observed_at.slice(11, 16)}Z sim)</small>}
      {obs && children}
    </div>
  )
}

function Satellite({ sat, node }) {
  const r = sat.radar, s = sat.sounder
  return (
    <section className="sd-panel" aria-labelledby="sd-sat-h">
      <div className="sd-panel-head">
        <h4 id="sd-sat-h">Tomorrow.io satellite feed <span className="mbadge blue">Simulated</span></h4>
        <p>Next passes: radar in {sat.next_pass_min.radar} min, sounder in {sat.next_pass_min.sounder} min · used for decisions while ≤ {sat.fresh_limit_min} min old</p>
      </div>
      <div className="sd-sat-call">
        Satellite sees now: {sat.call ? <b style={{ color: hz(sat.call) }}>{sat.call}</b> : <span className="sd-dim">no fresh data</span>}
        {node.verdict?.tiebreak && <p className="sd-use"><b>Used:</b> {node.verdict.tiebreak}.</p>}
        {node.sat_issues?.map(i => <p key={i} className="sd-use sd-warn"><b>Sensor cross-check:</b> {i}</p>)}
      </div>
      <div className="sd-products">
        <Product title="Precipitation radar (Ka-band)" obs={r}>
          <dl className="sd-readings">
            <div><dt>Rain at station</dt><dd>{fmt(r?.precip_mm_h)} mm/h</dd></div>
            <div><dt>Reflectivity</dt><dd>{fmt(r?.dbz)} dBZ</dd></div>
            <div><dt>Call</dt><dd style={{ color: hz(r?.call) }}>{r?.call}</dd></div>
          </dl>
        </Product>
        <Product title="Microwave sounder" obs={s}>
          <dl className="sd-readings">
            <div><dt>Cloud-top temp</dt><dd>{fmt(s?.cloud_top_c)} °C</dd></div>
            <div><dt>Precipitable water</dt><dd>{fmt(s?.precipitable_water_mm)} mm</dd></div>
            <div><dt>Instability</dt><dd>{s ? `${Math.round(s.instability * 100)}%` : '—'}</dd></div>
            <div><dt>Low stratus / fog</dt><dd>{s ? (s.low_stratus ? 'Yes' : 'No') : '—'}</dd></div>
          </dl>
        </Product>
      </div>
      <h5 className="sd-sub">Storm cells in the radar footprint (~95 nm)</h5>
      {!r?.cells?.length ? <p className="sd-dim">None at the last pass.</p> : (
        <div className="table-scroll" role="region" aria-label="Cells seen by satellite radar" tabIndex={0}>
          <table className="sd-table compact">
            <thead><tr><th scope="col">Cell</th><th scope="col">Type</th><th scope="col">dBZ</th><th scope="col">Where</th><th scope="col">Moving</th></tr></thead>
            <tbody>{r.cells.map(c => (
              <tr key={c.id}><th scope="row">{c.id}</th><td>{c.kind}</td><td>{c.dbz}</td>
                <td>{c.distance_nm} nm {compass(c.bearing)}</td><td>{compass(c.heading)} {c.speed_kt} kt</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h5 className="sd-sub">Outlook: cells due within 60 min</h5>
      {sat.outlook.length === 0 ? <p className="sd-dim">Nothing inbound.</p> : (
        <ul className="sd-outlook">{sat.outlook.map(o => (
          <li key={o.id}><b>{o.id}</b> {o.kind}, {o.dbz} dBZ — {o.eta_min === 0 ? 'overhead now' : `ETA ${o.eta_min} min`}</li>
        ))}</ul>
      )}
    </section>
  )
}

function LiveWeather({ station }) {
  const [live, setLive] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    setError('')
    api.meshLiveWeather(station).then(setLive).catch(e => setError(e.message))
  }, [station])
  useEffect(() => { setLive(null); load() }, [load])
  const v = live?.values
  return (
    <section className="sd-panel" aria-labelledby="sd-live-h" aria-busy={!live && !error}>
      <div className="sd-panel-head">
        <h4 id="sd-live-h">Real conditions now — Tomorrow.io <span className="mbadge green">Live</span></h4>
        <p>Actual weather at {station}, for reference. Not part of the simulation and not used in its decisions.</p>
      </div>
      {error && <p role="alert" className="sd-warn">{error}</p>}
      {!live && !error && <p className="sd-dim">Loading…</p>}
      {live && !live.configured && (
        <p className="sd-dim">Not connected: set <code>TOMORROW_API_KEY</code> on the server to show live Tomorrow.io data here.</p>
      )}
      {live?.configured && !v && <p className="sd-warn">{live.message}</p>}
      {v && (
        <>
          <dl className="sd-readings sd-live">
            <div><dt>Weather</dt><dd>{v.weather ?? '—'}</dd></div>
            <div><dt>Temperature</dt><dd>{fmt(v.temp_c)} °C</dd></div>
            <div><dt>Wind</dt><dd>{v.wind_dir_deg != null ? `${compass(v.wind_dir_deg)} ` : ''}{fmt(v.wind_kt)} kt{v.gust_kt ? `, gust ${fmt(v.gust_kt)}` : ''}</dd></div>
            <div><dt>Pressure</dt><dd>{fmt(v.pressure_hpa)} hPa</dd></div>
            <div><dt>Rain</dt><dd>{fmt(v.rain_mm_h)} mm/h</dd></div>
            <div><dt>Humidity</dt><dd>{fmt(v.humidity_pct)}%</dd></div>
            <div><dt>Visibility</dt><dd>{fmt(v.visibility_sm)} SM</dd></div>
            <div><dt>Cloud cover</dt><dd>{fmt(v.cloud_cover_pct)}%{v.ceiling_ft ? `, ceiling ${fmt(v.ceiling_ft)} ft` : ''}</dd></div>
          </dl>
          <p className="sd-dim">
            {live.observed_at ? `Observed ${live.observed_at.slice(11, 16)}Z` : ''}{live.cached ? ` · cached ${live.age_min} min` : ''}
            {live.status !== 'ok' && live.message ? ` · ${live.message}` : ''} · {live.source}
          </p>
        </>
      )}
      <button type="button" className="mesh-chip" onClick={load}>Refresh live data</button>
    </section>
  )
}

export default function StationDashboard({ station }) {
  const { data } = usePolling(useCallback(() => api.meshNode(station), [station]), 3000)
  const d = data?.station === station ? data : null
  return (
    <section className="station-dashboard" aria-labelledby="sd-h">
      <h3 id="sd-h">{station} station dashboard {d && <small>{d.name}</small>}</h3>
      {!d ? <p className="sd-dim">Loading station data…</p> : (
        <div className="sd-grid">
          <SensorNetwork sensors={d.sensor_net} metrics={d.metrics} station={station} />
          <div className="sd-side">
            <Satellite sat={d.satellite_detail} node={d} />
            <LiveWeather station={station} />
          </div>
        </div>
      )}
    </section>
  )
}
