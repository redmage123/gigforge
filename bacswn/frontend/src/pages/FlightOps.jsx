import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

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
function FlightCanvas({ flights, onSelect }) {
  const map = useMap()
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
        s.curLat += (s.targetLat - s.curLat) * LERP
        s.curLon += (s.targetLon - s.curLon) * LERP

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
  const { data: mapData } = usePolling(useCallback(() => api.mapLayers(), []), 30000)
  const [selected, setSelected] = useState(null)

  const flights = flightData?.flights || []
  const firRaw = mapData?.fir_polygon || []
  const firPolygon = firRaw.length > 0
    ? firRaw.map(([lon, lat]) => [lat, lon])
    : BAHAMAS_FIR

  const handleSelect = useCallback((f) => setSelected(f), [])

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
            background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6',
            borderRadius: 20, padding: '5px 16px', fontSize: 13, fontWeight: 700, color: '#3b82f6',
          }}>
            ✈ {flights.length} aircraft in Bahamas FIR
          </div>
          <div className="live-badge"><div className="live-dot" />LIVE</div>
        </div>
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['#3b82f6', 'Commercial', counts.commercial],
          ['#10b981', 'Private/GA', counts.private],
          ['#ef4444', 'Military', counts.military],
          ['#f59e0b', 'Rotorcraft', counts.rotorcraft],
          ['#94a3b8', 'Unknown', counts.unknown],
        ].map(([color, label, count]) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: color + '15', border: '1px solid ' + color + '40',
            borderRadius: 8, padding: '4px 12px', fontSize: 12,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 700, color }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Map + detail panel */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
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
                <FlightCanvas flights={flights} onSelect={handleSelect} />
              </MapContainer>
            )}
          </div>
        </div>

        {/* Selected aircraft panel */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {selected ? (
            <div className="card" style={{ borderLeft: '3px solid ' + getCatColor(selected.category) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.callsign?.trim() || selected.icao24}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    <span style={{ color: getCatColor(selected.category) }}>●</span> {CAT_LABEL[getCatColor(selected.category)]}
                  </div>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 13 }}>
                {[
                  ['Country', selected.origin_country],
                  ['Altitude', selected.baro_altitude ? 'FL' + Math.round(selected.baro_altitude * 3.281 / 100).toString().padStart(3, '0') : selected.altitude ? Math.round(selected.altitude * 3.281).toLocaleString() + ' ft' : 'GND'],
                  ['Speed', selected.velocity ? Math.round(selected.velocity * 1.944) + ' kt' : '—'],
                  ['Track', selected.track || selected.true_track ? Math.round(selected.track || selected.true_track) + '°' : '—'],
                  ['V/S', selected.vertical_rate ? (selected.vertical_rate > 0 ? '+' : '') + Math.round(selected.vertical_rate * 196.85) + ' fpm' : '—'],
                  ['Status', selected.on_ground ? 'On Ground' : 'Airborne'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontWeight: 600, marginTop: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {selected.icao24}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✈</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Select an Aircraft</div>
              <div style={{ fontSize: 12 }}>Click any aircraft on the map to view details</div>
              <div style={{ marginTop: 20, textAlign: 'left' }}>
                {[
                  ['#3b82f6', 'Commercial — Large/heavy'],
                  ['#10b981', 'Private/GA — Small/light'],
                  ['#ef4444', 'Military'],
                  ['#f59e0b', 'Rotorcraft'],
                  ['#94a3b8', 'Unknown'],
                ].map(([color, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          <h3>Active Flights ({flights.length})</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click row to select · auto-updates every 10s</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th><th>Callsign</th><th>Country</th>
                <th>Altitude</th><th>Speed</th><th>Track</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {flights.slice(0, 50).map(f => {
                const color = getCatColor(f.category)
                const isSelected = selected?.icao24 === f.icao24
                return (
                  <tr key={f.icao24} onClick={() => setSelected(f)} style={{
                    cursor: 'pointer',
                    background: isSelected ? color + '15' : undefined,
                  }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{CAT_LABEL[color]}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {f.callsign?.trim() || '—'}
                    </td>
                    <td>{f.origin_country}</td>
                    <td>{f.baro_altitude ? `FL${Math.round(f.baro_altitude * 3.281 / 100).toString().padStart(3, '0')}` : 'GND'}</td>
                    <td>{f.velocity ? `${Math.round(f.velocity * 1.944)}kt` : '—'}</td>
                    <td>{f.true_track ? `${Math.round(f.true_track)}°` : f.track ? `${Math.round(f.track)}°` : '—'}</td>
                    <td>
                      <span className={`cat-badge ${f.on_ground ? 'cat-IFR' : 'cat-VFR'}`}>
                        {f.on_ground ? 'GND' : 'AIRBORNE'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
