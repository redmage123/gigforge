import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Legend, Tooltip as ChartTooltip } from 'chart.js'
import { api } from '../api/client'
import { useUrlState } from '../components/share/useUrlState'
import ChartTable, { chartTextColor } from '../components/a11y/ChartTable'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Legend, ChartTooltip)

/**
 * Presentation view for a carbon-markets talk: a real hurricane (NOAA best
 * track for Dorian, 2019) replayed hour by hour over an illustrative portfolio
 * of coastal (blue-carbon) credit projects. The subject is the credits: how
 * much of the portfolio sat under hurricane-force winds, and for how long,
 * against a static buffer pool that treats every project alike.
 * Deliberately unbranded and outside the app layout (no sidebar), so it can be
 * shown on stage. Data: GET /api/hurricane/coastal-replay.
 */
const BAND = {
  64: ['Hurricane-force winds (64 kt or more)', '#ef4444'],
  50: ['Storm-force winds (50–63 kt)', '#f97316'],
  34: ['Gale-force winds (34–49 kt)', '#facc15'],
  0: ['Below gale force', '#22c55e'],
}
const PROJECT_COLOURS = ['#38bdf8', '#c4b5fd', '#5eead4', '#f9a8d4']
const SPEEDS = [1, 3, 6]
const VIEW = [[24.75, -79.0], [27.25, -76.6]]
const LABEL_SIDE = { 'abaco-marls': 'right', 'gb-north': 'bottom', 'lbb-seagrass': 'top', 'andros-north': 'right' }
const TITLE = 'Is the carbon still there?'
const catLabel = (c) => (c ? `Category ${c} hurricane` : 'Below hurricane strength')
const hours = (x) => `${x} hour${x === 1 ? '' : 's'}`

export default function CoastalPermanence() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const prev = document.title
    document.title = 'Coastal carbon permanence'
    return () => { document.title = prev }
  }, [])
  useEffect(() => { api.coastalReplay().then(setData).catch(e => setError(e.message)) }, [])

  if (error) return <main className="cp" id="main-content"><p className="cp-msg">Could not load the replay: {error}</p></main>
  if (!data) return <main className="cp" id="main-content"><p className="cp-msg" role="status">Loading the replay…</p></main>
  return <Replay data={data} />
}

function Replay({ data }) {
  const n = data.steps.length
  const [hUrl, setHUrl] = useUrlState('h', 0, (s) => (/^\d+$/.test(s) && Number(s) < n ? Number(s) : undefined))
  const [h, setH] = useState(hUrl)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(3)

  // Playback advances local state; the URL (for a shareable moment) follows when paused.
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setH(x => {
      if (x + 1 >= n) { setPlaying(false); return n - 1 }
      return x + 1
    }), 1000 / speed)
    return () => clearInterval(t)
  }, [playing, speed, n])
  useEffect(() => { if (!playing) setHUrl(h) }, [playing, h, setHUrl])

  const s = data.steps[h]
  const projects = data.projects
  const summary = useMemo(() => Object.fromEntries(data.summary.map(x => [x.id, x])), [data])
  const maxHours = Math.max(...data.summary.map(x => x.hours_hurricane))
  const minHours = Math.min(...data.summary.map(x => x.hours_hurricane))
  const done = h === n - 1
  const pastTrack = data.steps.slice(0, h + 1).map(x => [x.lat, x.lon])
  const fullTrack = useMemo(() => data.steps.map(x => [x.lat, x.lon]), [data])
  const peakIdx = useMemo(() => data.steps.reduce((b, x, k) => (x.portfolio_pct_hurricane > data.steps[b].portfolio_pct_hurricane ? k : b), 0), [data])

  const jump = (k) => { setPlaying(false); setH(Math.max(0, Math.min(n - 1, k))) }
  const tick = chartTextColor()
  const labels = data.steps.map(x => x.local)
  const series = projects.map(p => ({ name: p.name, values: data.steps.map(x => x.exposure[p.id].hours_hurricane) }))

  return (
    <main className="cp" id="main-content">
      <header className="cp-head">
        <div>
          <h1>{TITLE} <span>Storm risk in a coastal carbon-credit portfolio</span></h1>
          <p className="cp-sub">Hurricane Dorian, 31 August – 4 September 2019, replayed hour by hour over four illustrative blue-carbon projects.</p>
        </div>
        <div className="cp-clock" aria-live="off">
          <div className="cp-time">{s.local} <small>{data.local_time}</small></div>
          <div className="cp-storm">{catLabel(s.category)} · {s.vmax_kt} kt</div>
        </div>
      </header>

      <div className="cp-body">
        <section className="cp-map" aria-label="Map: the hurricane's wind field over the project areas">
          <MapContainer bounds={VIEW} minZoom={6} style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false} attributionControl>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagery: Esri, Maxar, Earthstar Geographics" />
            <Polyline positions={fullTrack} pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.35, dashArray: '4 6' }} />
            <Polyline positions={pastTrack} pathOptions={{ color: '#ffffff', weight: 2.5, opacity: 0.9 }} />
            {[34, 50, 64].map(b => s.field[b]?.length > 0 && (
              <Polygon key={b} positions={s.field[b]}
                pathOptions={{ color: BAND[b][1], weight: 1.5, fillColor: BAND[b][1], fillOpacity: b === 64 ? 0.28 : 0.12 }} />
            ))}
            {projects.map((p, k) => {
              const e = s.exposure[p.id]
              return (
                <Polygon key={p.id} positions={p.outline}
                  pathOptions={{ color: PROJECT_COLOURS[k], weight: 3, fillColor: BAND[e.band][1], fillOpacity: 0.45 }}>
                  <Tooltip permanent direction={LABEL_SIDE[p.id] || 'right'} className="cp-label">{p.name}</Tooltip>
                </Polygon>
              )
            })}
            <CircleMarker center={[s.lat, s.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
              <Tooltip direction="top">Dorian: {catLabel(s.category)}, {s.vmax_kt} kt, {s.pmin_mb} mb</Tooltip>
            </CircleMarker>
          </MapContainer>
          <ul className="cp-legend" aria-label="Map key">
            {[64, 50, 34, 0].map(b => <li key={b}><i style={{ background: BAND[b][1] }} />{BAND[b][0]}</li>)}
            <li><i className="cp-legend-track" />Storm track (dashed: still to come)</li>
          </ul>
        </section>

        <section className="cp-panel" aria-label="Credits exposed">
          <div className="cp-big">
            <div className="cp-big-n">{Math.round(s.portfolio_pct_hurricane)}%</div>
            <div>of the portfolio's credits under hurricane-force winds now
              <div className="cp-dim">Peak during the storm: {Math.round(data.portfolio.peak_pct_hurricane)}%</div>
            </div>
          </div>

          <table className="cp-table">
            <caption className="sr-only">Each project's exposure at {s.local}</caption>
            <thead><tr><th scope="col">Project (illustrative)</th><th scope="col">Share of portfolio</th>
              <th scope="col">Area under hurricane-force winds now</th><th scope="col">Hours of hurricane-force winds so far</th></tr></thead>
            <tbody>{projects.map((p, k) => {
              const e = s.exposure[p.id]
              return (
                <tr key={p.id}>
                  <th scope="row"><i className="cp-swatch" style={{ borderColor: PROJECT_COLOURS[k] }} />{p.name}<div className="cp-dim">{p.kind}</div></th>
                  <td>{Math.round(p.portfolio_share_pct)}%</td>
                  <td>
                    <div className="cp-bar" role="img" aria-label={`${Math.round(e.share[64])}% under hurricane-force winds, ${Math.round(e.share[34])}% under at least gale-force winds`}>
                      <span style={{ width: `${e.share[34]}%`, background: BAND[34][1] }} />
                      <span style={{ width: `${e.share[64]}%`, background: BAND[64][1] }} />
                    </div>
                    {Math.round(e.share[64])}%
                  </td>
                  <td className="cp-hours">{e.hours_hurricane}</td>
                </tr>
              )
            })}</tbody>
          </table>

          <div className={`cp-takeaway ${done ? 'is-final' : ''}`}>
            {done ? <>
              <b>Same buffer, very different risk.</b> A static buffer pool asks the same contribution from all four projects.
              Measured against this storm, their exposure ranged from {hours(minHours)} to {hours(maxHours)} of hurricane-force winds.
            </> : <>
              A static buffer pool asks the same contribution from every project here. Watch how differently the storm treats them.
            </>}
          </div>

          <div className="cp-chart">
            <Line
              aria-label={`Hours of hurricane-force winds over each project, accumulating through the storm. Final totals: ${data.summary.map(x => `${x.name} ${x.hours_hurricane}`).join(', ')}.`}
              role="img"
              data={{ labels, datasets: projects.map((p, k) => ({
                label: p.name, data: series[k].values.map((v, j) => (j <= h ? v : null)),
                borderColor: PROJECT_COLOURS[k], backgroundColor: PROJECT_COLOURS[k], pointRadius: 0, borderWidth: 2.5, spanGaps: false,
              })) }}
              options={{
                animation: false, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                  x: { ticks: { color: tick, maxTicksLimit: 5, maxRotation: 0 }, grid: { display: false } },
                  y: { min: 0, suggestedMax: maxHours + 2, ticks: { color: tick }, grid: { color: 'rgba(148,163,184,0.2)' },
                       title: { display: true, text: 'Hours of hurricane-force winds', color: tick } },
                },
              }} />
          </div>
          <ChartTable caption="Hours of hurricane-force winds over each project, by hour" labelHeader={`Time (${data.local_time})`}
            labels={labels} series={series} shareId="cp-hours" filename="dorian-coastal-exposure" />
        </section>
      </div>

      <div className="cp-controls" role="group" aria-label="Replay controls">
        <button type="button" className="btn btn-primary" onClick={() => { if (done) setH(0); setPlaying(p => !p) }}
          aria-pressed={playing}>
          {playing ? '❚❚ Pause' : done ? '↺ Replay' : '▶ Play'}
        </button>
        <button type="button" className="btn" onClick={() => jump(h - 1)}>◀ Previous hour</button>
        <button type="button" className="btn" onClick={() => jump(h + 1)}>Next hour ▶</button>
        <label className="cp-slider">
          <span className="sr-only">Storm time</span>
          <input type="range" min={0} max={n - 1} value={h} onChange={e => jump(Number(e.target.value))}
            aria-valuetext={`${s.local}, ${catLabel(s.category)}`} />
        </label>
        <button type="button" className="btn" onClick={() => jump(peakIdx)}>Jump to peak exposure</button>
        <button type="button" className="btn" onClick={() => jump(n - 1)}>Jump to the end</button>
        <label className="cp-speed">Speed{' '}
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            {SPEEDS.map(x => <option key={x} value={x}>{x} storm-hour{x > 1 ? 's' : ''} per second</option>)}
          </select>
        </label>
      </div>

      <footer className="cp-foot">
        <p><b>Source:</b> {data.source.dataset}, {data.source.storm} ({data.source.url}). Project outlines are illustrative, not real carbon projects.
          Wind exposure is not the same as loss: actual damage depends on storm surge, species and site.</p>
        <details>
          <summary>Method</summary>
          <ul>{data.method.map(m => <li key={m}>{m}</li>)}</ul>
        </details>
      </footer>
    </main>
  )
}
