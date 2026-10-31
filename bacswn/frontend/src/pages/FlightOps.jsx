import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { usePrefersReducedMotion } from '../hooks/useA11yPrefs'
import Dialog from '../components/a11y/Dialog'
import ChartTable, { chartTextColor, summarise } from '../components/a11y/ChartTable'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, ChartTooltip, Legend)

// ─── Aircraft category color ──────────────────────────────────────────
const getCatColor = (category) => {
  if (category >= 4 && category <= 7) return '#3b82f6'   // Commercial (large/heavy)
  if (category === 2 || category === 3) return '#10b981'  // Private / GA
  if (category === 9 || category === 10) return '#ef4444' // Military
  if (category === 8) return '#f59e0b'                    // Rotorcraft
  return '#94a3b8'                                        // Unknown
}

const CAT_LABEL = {
  '#3b82f6': 'Commercial', '#10b981': 'Private/GA',
  '#ef4444': 'Military', '#f59e0b': 'Rotorcraft', '#94a3b8': 'Unknown',
}

// Bahamas FIR approximate boundary [lat, lon]
const BAHAMAS_FIR = [
  [28.0, -80.5], [28.0, -77.5], [27.0, -76.5], [26.0, -76.0],
  [24.5, -75.5], [22.5, -75.5], [21.0, -77.0], [21.0, -79.5],
  [23.5, -81.5], [25.5, -81.5], [28.0, -80.5],
]

// ─── Canvas: smooth aircraft rendering with interpolation ─────────────
function FlightCanvas({ flights, onSelect, reducedMotion }) {
  const map = useMap()
  const motionRef = useRef(reducedMotion)
  motionRef.current = reducedMotion
  const animRef = useRef(null)
  const stateRef = useRef({})
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Update targets when new flight data arrives
  useEffect(() => {
    const ids = new Set(flights.map(f => f.icao24))
    flights.forEach(f => {
      const s = stateRef.current[f.icao24]
      if (!s) {
        stateRef.current[f.icao24] = {
          curLat: f.lat, curLon: f.lon,
          targetLat: f.lat, targetLon: f.lon,
          trail: [[f.lat, f.lon]],
          ...f,
        }
      } else {
        if (s.targetLat !== f.lat || s.targetLon !== f.lon) {
          s.trail.push([s.targetLat, s.targetLon])
          if (s.trail.length > 5) s.trail.shift()
        }
        const { curLat, curLon, trail } = s
        Object.assign(s, f, { curLat, curLon, trail, targetLat: f.lat, targetLon: f.lon })
      }
    })
    Object.keys(stateRef.current).forEach(id => { if (!ids.has(id)) delete stateRef.current[id] })
  }, [flights])

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:450;pointer-events:all;cursor:default;'
    // Pointer-only rendering; the Active Flights table is the keyboard / screen-reader equivalent.
    canvas.setAttribute('aria-hidden', 'true')
    map.getContainer().appendChild(canvas)

    const resize = () => {
      const s = map.getSize()
      canvas.width = s.x
      canvas.height = s.y
    }
    resize()
    map.on('resize', resize)
    map.on('moveend', resize)
    map.on('zoomend', resize)

    const onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      let closest = null, minDist = 22
      Object.values(stateRef.current).forEach(s => {
        const pt = map.latLngToContainerPoint([s.curLat, s.curLon])
        const d = Math.hypot(pt.x - mx, pt.y - my)
        if (d < minDist) { minDist = d; closest = s }
      })
      onSelectRef.current(closest)
    }
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('click', onClick)

    const LERP = 0.018

    const drawPlane = (ctx, x, y, track, color, size, hover) => {
      ctx.save()
      ctx.translate(x, y)
      // rotate: track is clockwise from north; canvas 0° = right, so subtract 90°
      ctx.rotate(((track || 0) - 90) * Math.PI / 180)
      const s = size
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(-s * 0.35, s * 0.22)
      ctx.lineTo(-s * 0.12, s * 0.10)
      ctx.lineTo(-s * 0.12, s * 0.56)
      ctx.lineTo(-s * 0.24, s * 0.66)
      ctx.lineTo(-s * 0.24, s * 0.74)
      ctx.lineTo(-s * 0.05, s * 0.64)
      ctx.lineTo(s * 0.05, s * 0.64)
      ctx.lineTo(s * 0.24, s * 0.74)
      ctx.lineTo(s * 0.24, s * 0.66)
      ctx.lineTo(s * 0.12, s * 0.56)
      ctx.lineTo(s * 0.12, s * 0.10)
      ctx.lineTo(s * 0.35, s * 0.22)
      ctx.closePath()
      if (hover) { ctx.shadowColor = color; ctx.shadowBlur = 14 }
      ctx.fillStyle = color
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = 0.7
      ctx.stroke()
      ctx.restore()
    }

    const frame = () => {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const { x: mx, y: my } = mouseRef.current

      Object.values(stateRef.current).forEach(s => {
        // Smooth interpolation toward target position
        // Reduced motion: jump to each new position instead of gliding.
        const k = motionRef.current ? 1 : LERP
        s.curLat += (s.targetLat - s.curLat) * k
        s.curLon += (s.targetLon - s.curLon) * k

        const pt = map.latLngToContainerPoint([s.curLat, s.curLon])
        const hover = Math.hypot(pt.x - mx, pt.y - my) < 22
        const color = getCatColor(s.category)

        // Fading trail (last 5 positions)
        if (s.trail.length > 1) {
          for (let i = 1; i < s.trail.length; i++) {
            const t1 = map.latLngToContainerPoint(s.trail[i - 1])
            const t2 = map.latLngToContainerPoint(s.trail[i])
            const alpha = (i / s.trail.length) * 0.38
            ctx.beginPath()
            ctx.moveTo(t1.x, t1.y)
            ctx.lineTo(t2.x, t2.y)
            ctx.strokeStyle = `rgba(251,191,36,${alpha})`
            ctx.lineWidth = 1.8
            ctx.stroke()
          }
        }

        const size = hover ? 12 : 9
        drawPlane(ctx, pt.x, pt.y, s.track || s.true_track || 0, color, size, hover)

        // Callsign label on hover
        if (hover && (s.callsign || s.icao24)) {
          const label = (s.callsign || s.icao24).trim()
          ctx.font = 'bold 11px monospace'
          ctx.shadowColor = '#000'
          ctx.shadowBlur = 4
          ctx.fillStyle = 'rgba(226,232,240,0.95)'
          ctx.fillText(label, pt.x + 14, pt.y - 5)
          ctx.shadowBlur = 0
        }
      })

      animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('resize', resize)
      map.off('moveend', resize)
      map.off('zoomend', resize)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('click', onClick)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }, [map])

  return null
}

// ─── Main component ───────────────────────────────────────────────────
export default function FlightOps() {
  const { data: flightData, loading } = usePolling(useCallback(() => api.liveFlights(), []), 10000)
  const { data: statsData } = usePolling(useCallback(() => api.flightStats(), []), 30000)
  const { data: mapData } = usePolling(useCallback(() => api.mapLayers(), []), 30000)
  const [selected, setSelected] = useState(null)

  const flights = (flightData?.flights || []).map(f => ({
    ...f,
    lat: f.lat || f.latitude,
    lon: f.lon || f.longitude,
  }))
  const firRaw = mapData?.fir_polygon || []
  const firPolygon = firRaw.length > 0
    ? firRaw.map(([lon, lat]) => [lat, lon])
    : BAHAMAS_FIR

  const handleSelect = useCallback((f) => setSelected(f), [])
  // Mesh weather ahead of each aircraft (predicted hazard entries in the next 30 min).
  const { data: airspace } = usePolling(useCallback(() => api.meshAirspace(), []), 10000)
  const ahead = Object.fromEntries((airspace?.conflicts || []).map(c => [c.icao24, c]))
  const reducedMotion = usePrefersReducedMotion()
  const legendColor = chartTextColor()

  // Category breakdown
  const counts = { commercial: 0, private: 0, military: 0, rotorcraft: 0, unknown: 0 }
  flights.forEach(f => {
    const c = getCatColor(f.category)
    if (c === '#3b82f6') counts.commercial++
    else if (c === '#10b981') counts.private++
    else if (c === '#ef4444') counts.military++
    else if (c === '#f59e0b') counts.rotorcraft++
    else counts.unknown++
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Flight Operations</h2>
          <p className="subtitle">Live airspace tracking — Bahamas FIR · 10s updates</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            background: 'rgba(59,130,246,0.15)', border: '1px solid var(--accent)',
            borderRadius: 20, padding: '5px 16px', fontSize: 13, fontWeight: 700, color: 'var(--accent-text)',
          }}>
            <span aria-hidden="true">✈ </span>{flights.length} aircraft in Bahamas FIR
          </div>
          <div className="live-badge"><div className="live-dot" />LIVE</div>
        </div>
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }} role="list" aria-label="Aircraft by category">
        {[
          ['#3b82f6', 'Commercial', counts.commercial],
          ['#10b981', 'Private/GA', counts.private],
          ['#ef4444', 'Military', counts.military],
          ['#f59e0b', 'Rotorcraft', counts.rotorcraft],
          ['#94a3b8', 'Unknown', counts.unknown],
        ].map(([color, label, count]) => (
          <div key={label} role="listitem" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: color + '15', border: '1px solid ' + color + '40',
            borderRadius: 8, padding: '4px 12px', fontSize: 12,
          }}>
            <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Map + detail panel */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minWidth: 0 }} role="region"
          aria-label={`Airspace map: ${flights.length} aircraft in the Bahamas FIR. The Active Flights table below lists the same aircraft.`}>
          <div style={{ height: 580 }}>
            {loading && !flightData ? (
              <div className="loading-spinner"><div className="spinner" /></div>
            ) : (
              <MapContainer center={[24.5, -76.5]} zoom={7} style={{ height: '100%', width: '100%' }}
                zoomControl attributionControl={false} minZoom={4} maxZoom={18}>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
                {/* Bahamas FIR boundary */}
                <Polygon positions={firPolygon}
                  pathOptions={{ color: '#3b82f6', weight: 2, fillOpacity: 0.04, dashArray: '10 6' }} />
                {/* Canvas aircraft renderer */}
                <FlightCanvas flights={flights} onSelect={handleSelect} reducedMotion={reducedMotion} />
              </MapContainer>
            )}
          </div>
        </div>

        {/* Selected aircraft panel */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {/* Charts dashboard */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header"><h3>By Country</h3></div>
            <div style={{ height: 180, padding: 8 }}>
              <Doughnut aria-label={`Doughnut chart, aircraft by country of origin: ${summarise(Object.keys(statsData?.by_country || {}).slice(0, 8), Object.values(statsData?.by_country || {}).slice(0, 8))}`} data={{
                labels: Object.keys(statsData?.by_country || {}).slice(0, 8),
                datasets: [{ data: Object.values(statsData?.by_country || {}).slice(0, 8),
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#94a3b8'],
                  borderWidth: 0 }]
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: legendColor, font: { size: 11 } } } } }} />
            </div>
            <div style={{ padding: '0 8px 8px' }}>
              <ChartTable caption="Aircraft by country of origin" labels={Object.keys(statsData?.by_country || {}).slice(0, 8)}
                series={[{ name: 'Aircraft', values: Object.values(statsData?.by_country || {}).slice(0, 8) }]} />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header"><h3>Altitude Distribution</h3></div>
            <div style={{ height: 180, padding: 8 }}>
              {(() => {
                const ab = statsData?.altitude_bands || {}
                const labels = ['Ground', 'Low (<3km)', 'Medium (3-8km)', 'High (8-12km)', 'Cruise (>12km)']
                const vals = [ab.ground || 0, ab.low || 0, ab.medium || 0, ab.high || 0, ab.cruise || 0]
                return <Bar aria-label={`Bar chart, aircraft by altitude band: ${summarise(labels, vals)}`} data={{
                  labels,
                  datasets: [{ label: 'Flights', data: vals,
                    backgroundColor: ['#94a3b8', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                    borderRadius: 6 }]
                }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: legendColor, font: { size: 10 } } }, y: { ticks: { color: legendColor }, grid: { color: 'rgba(148,163,184,0.2)' } } } }} />
              })()}
            </div>
            <div style={{ padding: '0 8px 8px' }}>
              <ChartTable caption="Aircraft by altitude band"
                labels={['Ground', 'Low (<3km)', 'Medium (3-8km)', 'High (8-12km)', 'Cruise (>12km)']}
                series={[{ name: 'Aircraft', values: ['ground', 'low', 'medium', 'high', 'cruise'].map(k => statsData?.altitude_bands?.[k] || 0) }]} />
            </div>
          </div>

        </div>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <span className="stat-label">Total Flights</span>
          <span className="stat-value accent">{flights.length}</span>
          <span className="stat-detail">In Bahamas FIR</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Airborne</span>
          <span className="stat-value success">{flights.filter(f => !f.on_ground).length}</span>
          <span className="stat-detail">{flights.filter(f => f.on_ground).length} on ground</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Commercial</span>
          <span className="stat-value info">{counts.commercial}</span>
          <span className="stat-detail">Large / heavy aircraft</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Countries</span>
          <span className="stat-value">{new Set(flights.map(f => f.origin_country)).size}</span>
          <span className="stat-detail">Origins in FIR</span>
        </div>
      </div>

      {/* Flight table */}
      <div className="card">
        <div className="card-header">
          <h3 id="active-flights-h">Active Flights ({flights.length})</h3>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Select a callsign for details · updates every 10 s</span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="active-flights-h">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Type</th><th scope="col">Callsign</th><th scope="col">Country</th>
                <th scope="col">Altitude</th><th scope="col">Speed</th><th scope="col">Track</th><th scope="col">Status</th>
                <th scope="col">Weather ahead (30 min)</th>
              </tr>
            </thead>
            <tbody>
              {flights.slice(0, 50).map(f => {
                const color = getCatColor(f.category)
                const isSelected = selected?.icao24 === f.icao24
                return (
                  <tr key={f.icao24} onClick={() => setSelected(f)} style={{ cursor: 'pointer',
                    cursor: 'pointer',
                    background: isSelected ? color + '15' : undefined,
                  }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{CAT_LABEL[color]}</span>
                      </div>
                    </td>
                    <th scope="row" style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      <button type="button" className="link-btn" style={{ fontFamily: 'inherit' }}
                        aria-label={`${f.callsign?.trim() || f.icao24}, show details`}
                        onClick={e => { e.stopPropagation(); setSelected(f) }}>{f.callsign?.trim() || f.icao24}</button>
                      {isSelected && <span className="sr-only"> (selected)</span>}
                    </th>
                    <td>{f.origin_country}</td>
                    <td>{f.baro_altitude ? `FL${Math.round(f.baro_altitude * 3.281 / 100).toString().padStart(3, '0')}` : 'GND'}</td>
                    <td>{f.velocity ? `${Math.round(f.velocity * 1.944)}kt` : '—'}</td>
                    <td>{f.true_track ? `${Math.round(f.true_track)}°` : f.track ? `${Math.round(f.track)}°` : '—'}</td>
                    <td>
                      <span className={`cat-badge ${f.on_ground ? 'cat-IFR' : 'cat-VFR'}`}>
                        {f.on_ground ? 'GND' : 'AIRBORNE'}
                      </span>
                    </td>
                    <td>{ahead[f.icao24] ? (
                      <span style={{ color: ahead[f.icao24].severity === 'severe' ? 'var(--danger-text)' : 'var(--warning-text)', fontWeight: 600 }}>
                        {ahead[f.icao24].hazard} {ahead[f.icao24].inside ? 'now' : `in ${ahead[f.icao24].minutes_to_entry} min`}
                      </span>
                    ) : <span style={{ color: 'var(--text-secondary)' }}>Clear</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flight details */}
      <Dialog open={!!selected} onClose={() => setSelected(null)}
        title={selected ? `${selected.callsign?.trim() || selected.icao24}${selected.airline ? ` — ${selected.airline}` : ''}` : ''}>
        {selected && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px 20px', fontSize: 13, margin: 0 }}>
            {[
              ['Airline', selected.airline || '—'],
              ['Aircraft', selected.aircraft_type || '—'],
              ['Registration', selected.registration || '—'],
              ['Route', selected.route || '—'],
              ['Origin', selected.origin_country || '—'],
              ['ICAO24', selected.icao24],
              ['Altitude', selected.baro_altitude ? 'FL' + Math.round(selected.baro_altitude * 3.281 / 100).toString().padStart(3, '0') : 'GND'],
              ['Ground Speed', selected.velocity ? Math.round(selected.velocity * 1.944) + ' kt' : '—'],
              ['Heading', (selected.track || selected.true_track) ? Math.round(selected.track || selected.true_track) + '°' : '—'],
              ['Vertical Speed', selected.vertical_rate ? (selected.vertical_rate > 0 ? '+' : '') + Math.round(selected.vertical_rate * 196.85) + ' fpm' : '—'],
              ['Squawk', selected.squawk || '—'],
              ['Status', selected.on_ground ? 'On Ground' : 'Airborne'],
              ['Weather ahead', ahead[selected.icao24]
                ? `${ahead[selected.icao24].hazard} ${ahead[selected.icao24].inside ? 'now' : `in ${ahead[selected.icao24].minutes_to_entry} min`} — ${ahead[selected.icao24].advice.text}`
                : 'Clear for 30 min'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</dt>
                <dd style={{ fontWeight: 600, marginTop: 3, marginLeft: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Dialog>
    </div>
  )
}
