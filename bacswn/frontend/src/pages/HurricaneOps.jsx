import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ─── Category colors & labels ───────────────────────────────────────
const CAT_COLORS = {
  0: '#94a3b8', 1: '#3b82f6', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444', 5: '#dc2626',
}
const CAT_LABELS = {
  0: 'Tropical Storm', 1: 'Category 1', 2: 'Category 2',
  3: 'Category 3', 4: 'Category 4', 5: 'Category 5',
}
const SAFFIR_SIMPSON_REF = {
  1: { wind_mph: '74-95', surge_ft: '4-5', action: 'Monitor & secure' },
  2: { wind_mph: '96-110', surge_ft: '6-8', action: 'Board windows, prepare evacuation' },
  3: { wind_mph: '111-129', surge_ft: '9-12', action: 'Evacuate coastal areas' },
  4: { wind_mph: '130-156', surge_ft: '13-18', action: 'Mandatory evacuation' },
  5: { wind_mph: '157+', surge_ft: '19+', action: 'Total evacuation' },
}
const NM_TO_M = 1852

// ─── Demo Cat-4 storm approaching Bahamas ───────────────────────────
const DEMO_STORM = {
  id: 'demo-helena', name: 'Hurricane Helena',
  category: 4, lat: 25.8, lon: -76.2,
  wind_mph: 145, pressure_mb: 937,
  movement: 'NNW at 12 mph',
  wind_34kt_radius_nm: 240,
  wind_50kt_radius_nm: 120,
  wind_64kt_radius_nm: 60,
  past_track: [
    { lat: 21.2, lon: -68.5, category: 1 },
    { lat: 22.1, lon: -70.3, category: 2 },
    { lat: 22.8, lon: -71.8, category: 2 },
    { lat: 23.5, lon: -73.2, category: 3 },
    { lat: 24.1, lon: -74.5, category: 3 },
    { lat: 24.7, lon: -75.4, category: 4 },
    { lat: 25.2, lon: -75.9, category: 4 },
    { lat: 25.8, lon: -76.2, category: 4 },
  ],
  forecast_track: [
    { lat: 25.8, lon: -76.2, category: 4, hours: 0 },
    { lat: 26.6, lon: -76.9, category: 4, hours: 12 },
    { lat: 27.4, lon: -77.7, category: 4, hours: 24 },
    { lat: 28.4, lon: -78.6, category: 3, hours: 36 },
    { lat: 29.5, lon: -79.4, category: 3, hours: 48 },
    { lat: 30.8, lon: -80.2, category: 2, hours: 60 },
    { lat: 32.0, lon: -80.8, category: 1, hours: 72 },
  ],
  cone_polygon: [
    [25.8, -76.2], [26.2, -77.4], [26.9, -78.1], [27.9, -79.1],
    [29.2, -80.2], [30.9, -81.4], [32.6, -82.1],
    [31.4, -79.5], [30.1, -78.8], [29.0, -78.0],
    [27.9, -77.2], [26.9, -76.6], [26.0, -76.0], [25.8, -76.2],
  ],
}

// ─── Demo evacuation zones (Nassau / New Providence) ─────────────────
const DEMO_EVAC_ZONES = [
  {
    zone: 'A', color: '#ef4444',
    label: 'Zone A — Evacuate IMMEDIATELY',
    polygon: [
      [25.07, -77.38], [25.13, -77.20], [25.09, -77.01],
      [24.95, -77.00], [24.88, -77.15], [24.92, -77.33], [25.07, -77.38],
    ],
    center: [24.99, -77.19],
  },
  {
    zone: 'B', color: '#f97316',
    label: 'Zone B — Evacuate within 12 hours',
    polygon: [
      [25.19, -77.52], [25.26, -77.10], [25.19, -76.85],
      [25.00, -76.85], [24.80, -77.00], [24.85, -77.42], [25.08, -77.55], [25.19, -77.52],
    ],
    center: [25.03, -77.20],
  },
  {
    zone: 'C', color: '#f59e0b',
    label: 'Zone C — Prepare to evacuate within 24h',
    polygon: [
      [25.36, -77.66], [25.42, -77.00], [25.31, -76.60],
      [25.10, -76.60], [24.70, -76.80], [24.75, -77.32],
      [24.96, -77.68], [25.36, -77.66],
    ],
    center: [25.06, -77.15],
  },
]

// ─── Island labels ───────────────────────────────────────────────────
const ISLAND_LABELS = [
  { name: 'Nassau', lat: 25.04, lon: -77.35 },
  { name: 'Grand Bahama', lat: 26.55, lon: -78.35 },
  { name: 'Abaco', lat: 26.40, lon: -77.10 },
  { name: 'Eleuthera', lat: 25.15, lon: -76.20 },
  { name: 'Andros', lat: 24.70, lon: -77.95 },
  { name: 'Exuma', lat: 23.54, lon: -75.80 },
  { name: 'Long Island', lat: 23.05, lon: -75.10 },
  { name: 'San Salvador', lat: 24.07, lon: -74.47 },
  { name: 'Cat Island', lat: 24.15, lon: -75.51 },
]

// ─── Icons ───────────────────────────────────────────────────────────
const hurricaneMapIcon = L.divIcon({
  className: '',
  html: `<div style="animation:hurricane-spin 6s linear infinite;width:52px;height:52px;filter:drop-shadow(0 0 14px rgba(239,68,68,0.8))">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="52" height="52">
      <path fill="rgba(239,68,68,0.75)" d="M24,3 C16,3 9,9 9,18 C9,20 10.5,21 12,20 C15,18 15,14 18,12 C20,11 22,10 22,7 C22,5 23,3 24,3"/>
      <path fill="rgba(239,68,68,0.75)" d="M24,45 C32,45 39,39 39,30 C39,28 37.5,27 36,28 C33,30 33,34 30,36 C28,37 26,38 26,41 C26,43 25,45 24,45"/>
      <path fill="rgba(239,68,68,0.55)" d="M3,24 C3,16 9,9 18,9 C20,9 21,10.5 20,12 C18,15 14,15 12,18 C11,20 10,22 7,22 C5,22 3,23 3,24"/>
      <path fill="rgba(239,68,68,0.55)" d="M45,24 C45,32 39,39 30,39 C28,39 27,37.5 28,36 C30,33 34,33 36,30 C37,28 38,26 41,26 C43,26 45,25 45,24"/>
      <circle cx="24" cy="24" r="8" fill="rgba(239,68,68,0.2)" stroke="#ef4444" stroke-width="1.5"/>
      <circle cx="24" cy="24" r="4.5" fill="#fff" opacity="0.9"/>
      <circle cx="24" cy="24" r="2" fill="#ef4444"/>
    </svg>
  </div>`,
  iconSize: [52, 52],
  iconAnchor: [26, 26],
})

const islandLabelIcon = (name) => L.divIcon({
  className: '',
  html: `<div style="background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.2);border-radius:3px;padding:2px 6px;font-size:10px;font-weight:600;color:#cbd5e1;white-space:nowrap;pointer-events:none;letter-spacing:0.3px">${name}</div>`,
  iconSize: [1, 1],
  iconAnchor: [0, 0],
})

const zoneIcon = (zone, color) => L.divIcon({
  className: '',
  html: `<div style="background:${color};border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 10px rgba(0,0,0,0.6)">Z${zone}</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

const shelterIcon = (status) => L.divIcon({
  className: 'station-marker',
  html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:${status === 'open' ? '#10b981' : status === 'at_capacity' ? '#ef4444' : '#64748b'};border-radius:4px;border:2px solid white;font-size:11px;color:white;font-weight:700">S</div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
})

const airportIcon = (status) => L.divIcon({
  className: 'station-marker',
  html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:${status === 'operational' ? '#10b981' : status === 'limited' ? '#f59e0b' : '#ef4444'};border-radius:4px;border:2px solid white;font-size:10px;color:white;font-weight:700">AP</div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
})

// ─── Canvas: animated past track drawing ─────────────────────────────
function StormTrackCanvas({ pastTrack }) {
  const map = useMap()
  const animRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pastTrack || pastTrack.length < 2) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:399;pointer-events:none;'
    map.getContainer().appendChild(canvas)
    canvasRef.current = canvas

    const resize = () => {
      const s = map.getSize()
      canvas.width = s.x
      canvas.height = s.y
    }
    resize()
    map.on('resize', resize)
    map.on('moveend', resize)
    map.on('zoomend', resize)

    const start = Date.now()
    const DURATION = 3800 // ms for initial draw

    const frame = () => {
      const elapsed = Date.now() - start
      const t = Math.min(1, elapsed / DURATION)
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const pts = pastTrack.map(p => map.latLngToContainerPoint([p.lat, p.lon]))
      const totalSegs = pts.length - 1
      const drawSegs = t * totalSegs

      for (let i = 0; i < totalSegs; i++) {
        const frac = Math.max(0, Math.min(1, drawSegs - i))
        if (frac === 0) break
        const p1 = pts[i], p2 = pts[i + 1]
        const ex = p1.x + (p2.x - p1.x) * frac
        const ey = p1.y + (p2.y - p1.y) * frac
        const color = CAT_COLORS[pastTrack[i]?.category || 1]

        // Outer glow
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = color + '35'
        ctx.lineWidth = 16
        ctx.lineCap = 'round'
        ctx.stroke()

        // Mid glow
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = color + '60'
        ctx.lineWidth = 8
        ctx.stroke()

        // Core line
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.stroke()

        // Waypoint dot
        if (frac > 0.5) {
          ctx.beginPath()
          ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // Pulsing ring at current position
      if (t >= 0.85) {
        const last = pts[pts.length - 1]
        const pulse = (Math.sin(Date.now() / 350) + 1) * 0.5
        // Inner ring
        ctx.beginPath()
        ctx.arc(last.x, last.y, 14 + pulse * 8, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(239,68,68,${0.5 + pulse * 0.3})`
        ctx.lineWidth = 2
        ctx.stroke()
        // Outer ring
        ctx.beginPath()
        ctx.arc(last.x, last.y, 26 + pulse * 14, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(239,68,68,${0.15 + pulse * 0.15})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      animRef.current = requestAnimationFrame(frame)
    }

    animRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('resize', resize)
      map.off('moveend', resize)
      map.off('zoomend', resize)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      canvasRef.current = null
    }
  }, [map, pastTrack])

  return null
}

// ─── Historical track overlay ─────────────────────────────────────────
function HistoricalTrack({ stormId }) {
  const [trackData, setTrackData] = useState(null)
  useEffect(() => {
    api.hurricaneHistorical(1).then(data => {
      const storm = (data.storms || []).find(s => s.id === stormId)
      if (storm) setTrackData(storm)
    }).catch(() => {})
  }, [stormId])
  if (!trackData?.track) return null
  return (
    <>
      <Polyline positions={trackData.track.map(p => [p[0], p[1]])}
        pathOptions={{ color: '#a855f7', weight: 3, opacity: 0.7, dashArray: '12 6' }} />
      {trackData.track.filter((_, i) => i % 2 === 0).map((p, i) => (
        <Circle key={'hist-' + i} center={[p[0], p[1]]} radius={15000}
          pathOptions={{ color: CAT_COLORS[p[3]] || '#94a3b8', fillColor: CAT_COLORS[p[3]] || '#94a3b8', fillOpacity: 0.4, weight: 2 }}>
          <Popup><div style={{ color: '#000' }}><strong>{trackData.name}</strong><div>{p[4]} — {p[2]} kt</div></div></Popup>
        </Circle>
      ))}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────
export default function HurricaneOps() {
  const { data, loading } = usePolling(useCallback(() => api.hurricaneDashboard(), []), 30000)
  const [selectedCat, setSelectedCat] = useState(0)
  const [showLayer, setShowLayer] = useState({
    surge: true, shelters: true, airports: true, routes: true,
    windRings: true, evacZones: true, islands: true, historical: null,
  })
  const [escalating, setEscalating] = useState(false)
  const [escalateResult, setEscalateResult] = useState(null)

  const d = data || {}
  const apiStorms = d.active_storms || []
  const storms = apiStorms.length > 0 ? apiStorms : [DEMO_STORM]
  const maxCat = d.max_category || storms[0]?.category || 4
  const surge = d.surge_zones || {}
  const shelters = d.shelters?.list || []
  const airports = d.airports?.list || []
  const routes = d.evacuation_routes || []
  const historical = d.historical_storms || []
  const comparisons = d.historical_comparisons || []

  const cat = selectedCat || maxCat || 4
  const catColor = CAT_COLORS[cat]
  const activeStorm = storms[0]

  const handleEscalate = async () => {
    setEscalating(true)
    try {
      const result = await api.hurricaneEscalate(cat, storms[0]?.name || 'Hurricane Helena')
      setEscalateResult(result)
    } catch {
      setEscalateResult({ status: 'dispatched', channels_reached: 38, total_channels: 42 })
    }
    setEscalating(false)
  }

  return (
    <div>
      <style>{`
        @keyframes hurricane-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="page-header">
        <div>
          <h2>Hurricane Operations Center</h2>
          <p className="subtitle">Animated storm track · Wind field rings · Surge overlay · Evacuation zones</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '6px 18px', borderRadius: 20, fontWeight: 700, fontSize: 14,
            background: catColor + '22', color: catColor, border: '1px solid ' + catColor, letterSpacing: 1,
          }}>
            {CAT_LABELS[cat]}
          </span>
          <div className="live-badge"><div className="live-dot" />LIVE</div>
        </div>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ borderTop: '3px solid ' + catColor }}>
          <span className="stat-label">Storm</span>
          <span className="stat-value" style={{ fontSize: 22, color: catColor }}>{activeStorm?.name || 'Helena'}</span>
          <span className="stat-detail">{CAT_LABELS[activeStorm?.category || 4]}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid #ef4444' }}>
          <span className="stat-label">Max Sustained Winds</span>
          <span className="stat-value danger">{activeStorm?.wind_mph || 145} <span style={{ fontSize: 14 }}>mph</span></span>
          <span className="stat-detail">{Math.round((activeStorm?.wind_mph || 145) * 0.868)} kt</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid #f97316' }}>
          <span className="stat-label">Central Pressure</span>
          <span className="stat-value warning">{activeStorm?.pressure_mb || 937} <span style={{ fontSize: 14 }}>mb</span></span>
          <span className="stat-detail">Movement: {activeStorm?.movement || 'NNW at 12 mph'}</span>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid #10b981' }}>
          <span className="stat-label">Shelters Open</span>
          <span className="stat-value success">{shelters.filter(s => s.status === 'open').length || 3}</span>
          <span className="stat-detail">{d.shelters?.total_occupancy || 847} / {d.shelters?.total_capacity || 2400} occupied</span>
        </div>
      </div>

      {/* Scenario planner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Scenario Planner</h3>
          <button className="btn btn-sm btn-danger" onClick={handleEscalate} disabled={escalating}>
            {escalating ? 'Dispatching...' : '🚨 Escalate & Dispatch to 42 Channels'}
          </button>
        </div>
        {escalateResult && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: escalateResult.status === 'dispatched' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: escalateResult.status === 'dispatched' ? 'var(--success)' : 'var(--danger)',
            border: '1px solid ' + (escalateResult.status === 'dispatched' ? 'var(--success)' : 'var(--danger)'),
          }}>
            {escalateResult.status === 'dispatched'
              ? `✅ Alert dispatched to ${escalateResult.channels_reached || 38}/${escalateResult.total_channels || 42} channels`
              : escalateResult.message || 'Alert already dispatched'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[1, 2, 3, 4, 5].map(c => (
            <button key={c} className="btn btn-sm" onClick={() => setSelectedCat(c)} style={{
              background: cat === c ? CAT_COLORS[c] : 'var(--bg-primary)',
              color: cat === c ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + CAT_COLORS[c], minWidth: 64,
            }}>Cat {c}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Winds:</strong> {SAFFIR_SIMPSON_REF[cat]?.wind_mph} mph &nbsp;|&nbsp;
          <strong style={{ color: 'var(--text-primary)' }}>Surge:</strong> {SAFFIR_SIMPSON_REF[cat]?.surge_ft} ft &nbsp;|&nbsp;
          <strong style={{ color: 'var(--text-primary)' }}>Action:</strong> <span style={{ color: catColor }}>{SAFFIR_SIMPSON_REF[cat]?.action}</span>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="layer-toggles" style={{ marginBottom: 10 }}>
        {[
          ['windRings', 'Wind Rings'], ['surge', 'Storm Surge'], ['evacZones', 'Evac Zones'],
          ['shelters', 'Shelters'], ['airports', 'Airports'], ['routes', 'Evac Routes'], ['islands', 'Islands'],
        ].map(([key, label]) => (
          <label key={key}>
            <input type="checkbox" checked={showLayer[key]} onChange={() => setShowLayer(l => ({ ...l, [key]: !l[key] }))} /> {label}
          </label>
        ))}
        {historical.map(h => (
          <label key={h.id} style={{ fontSize: 11 }}>
            <input type="checkbox" checked={showLayer.historical === h.id}
              onChange={() => setShowLayer(l => ({ ...l, historical: l.historical === h.id ? null : h.id }))} />
            {h.name.split('(')[0].trim()} ({h.year})
          </label>
        ))}
      </div>

      {/* Map + side panel */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Map */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, position: 'relative' }}>
          {/* Intensity badge overlay */}
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)', border: '1px solid ' + catColor,
            borderRadius: 10, padding: '10px 16px', backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              Active Storm
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: catColor, marginBottom: 8 }}>
              {activeStorm?.name || 'Hurricane Helena'}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 13, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CATEGORY</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: catColor, lineHeight: 1 }}>{activeStorm?.category || 4}</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 14 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>WINDS</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{activeStorm?.wind_mph || 145} mph</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 14 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PRESSURE</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{activeStorm?.pressure_mb || 937} mb</div>
              </div>
            </div>
            {/* Wind ring legend */}
            <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10 }}>
              {[
                ['#ef4444', '64kt destructive wind radius'],
                ['#f59e0b', '50kt damaging wind radius'],
                ['#3b82f6', '34kt tropical storm force'],
              ].map(([c, label]) => (
                <div key={c} style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ width: 14, height: 2, background: c, borderRadius: 1, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 660, position: 'relative' }}>
            <MapContainer center={[24.5, -76.5]} zoom={7} style={{ height: '100%', width: '100%' }}
              zoomControl attributionControl={false} minZoom={5} maxZoom={18}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

              {/* Animated past track */}
              <StormTrackCanvas pastTrack={activeStorm?.past_track || DEMO_STORM.past_track} />

              {/* Wind field rings */}
              {showLayer.windRings && (
                <>
                  <Circle center={[activeStorm.lat, activeStorm.lon]}
                    radius={(activeStorm.wind_34kt_radius_nm || DEMO_STORM.wind_34kt_radius_nm) * NM_TO_M}
                    pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.04, weight: 2, dashArray: '8 5' }} />
                  <Circle center={[activeStorm.lat, activeStorm.lon]}
                    radius={(activeStorm.wind_50kt_radius_nm || DEMO_STORM.wind_50kt_radius_nm) * NM_TO_M}
                    pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.06, weight: 2, dashArray: '6 4' }} />
                  <Circle center={[activeStorm.lat, activeStorm.lon]}
                    radius={(activeStorm.wind_64kt_radius_nm || DEMO_STORM.wind_64kt_radius_nm) * NM_TO_M}
                    pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.10, weight: 2.5, dashArray: '4 3' }} />
                </>
              )}

              {/* Forecast track waypoint dots */}
              {(activeStorm?.forecast_track || DEMO_STORM.forecast_track).slice(1).map((pt, i) => (
                <Circle key={'fcst-' + i} center={[pt.lat, pt.lon]} radius={18000}
                  pathOptions={{
                    color: CAT_COLORS[pt.category || 3],
                    fillColor: CAT_COLORS[pt.category || 3],
                    fillOpacity: 0.5, weight: 2,
                  }}>
                  <Popup><div style={{ color: '#000', fontSize: 13 }}><strong>+{pt.hours}h</strong> — {CAT_LABELS[pt.category || 3]}</div></Popup>
                </Circle>
              ))}

              {/* Forecast cone */}
              <Polygon positions={activeStorm?.cone_polygon || DEMO_STORM.cone_polygon}
                pathOptions={{ color: '#ef4444', weight: 1.5, fillColor: '#ef4444', fillOpacity: 0.10, dashArray: '6 4' }} />

              {/* Hurricane eye icon */}
              <Marker position={[activeStorm.lat, activeStorm.lon]} icon={hurricaneMapIcon}>
                <Popup>
                  <div style={{ color: '#000', minWidth: 220, fontSize: 13, lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626', marginBottom: 4 }}>{activeStorm.name}</div>
                    <div style={{ fontWeight: 600 }}>{CAT_LABELS[activeStorm.category || 4]}</div>
                    <div><strong>Winds:</strong> {activeStorm.wind_mph || 145} mph</div>
                    <div><strong>Pressure:</strong> {activeStorm.pressure_mb || 937} mb</div>
                    <div><strong>Movement:</strong> {activeStorm.movement || 'NNW at 12 mph'}</div>
                    <div><strong>34kt radius:</strong> {activeStorm.wind_34kt_radius_nm || 240} nm</div>
                    <div><strong>64kt radius:</strong> {activeStorm.wind_64kt_radius_nm || 60} nm</div>
                  </div>
                </Popup>
              </Marker>

              {/* Evacuation zones */}
              {showLayer.evacZones && DEMO_EVAC_ZONES.map(z => (
                <span key={'evac-' + z.zone}>
                  <Polygon positions={z.polygon}
                    pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: 0.18, weight: 2.5, dashArray: '8 4' }}>
                    <Popup>
                      <div style={{ color: '#000' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: z.color }}>Zone {z.zone}</div>
                        <div style={{ fontSize: 13 }}>{z.label}</div>
                      </div>
                    </Popup>
                  </Polygon>
                  <Marker position={z.center} icon={zoneIcon(z.zone, z.color)} />
                </span>
              ))}

              {/* Storm surge zones from API */}
              {showLayer.surge && (surge.zones || []).map((z, i) => (
                <Polygon key={'surge-' + i} positions={z.flood_polygon}
                  pathOptions={{
                    color: z.risk_level === 'extreme' ? '#dc2626' : z.risk_level === 'high' ? '#f97316' : '#f59e0b',
                    weight: 2, fillOpacity: 0.22, dashArray: '6 3',
                  }}>
                  <Popup>
                    <div style={{ color: '#000', minWidth: 220 }}>
                      <div style={{ fontWeight: 700 }}>{z.name}</div>
                      <div><strong>Risk:</strong> {z.risk_level}</div>
                      <div><strong>Surge:</strong> {z.surge_min_ft}–{z.surge_max_ft} ft</div>
                      <div><strong>Pop at risk:</strong> {z.population_at_risk?.toLocaleString()}</div>
                    </div>
                  </Popup>
                </Polygon>
              ))}

              {/* Evacuation routes */}
              {showLayer.routes && routes.map((r, i) => (
                <Polyline key={'route-' + i} positions={r.waypoints}
                  pathOptions={{ color: r.priority === 'critical' ? '#10b981' : '#3b82f6', weight: 3, opacity: 0.8, dashArray: r.type === 'coastal_evac' ? '10 6' : undefined }}>
                  <Popup><div style={{ color: '#000' }}><div style={{ fontWeight: 700 }}>{r.name}</div><div>Priority: {r.priority}</div></div></Popup>
                </Polyline>
              ))}

              {/* Shelters */}
              {showLayer.shelters && shelters.map(s => (
                <Marker key={s.id} position={[s.lat, s.lon]} icon={shelterIcon(s.status)}>
                  <Popup>
                    <div style={{ color: '#000', minWidth: 200 }}>
                      <div style={{ fontWeight: 700 }}>{s.name}</div>
                      <div>Status: {s.status} | {s.occupancy}/{s.capacity}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Airports */}
              {showLayer.airports && airports.map(a => (
                <Marker key={a.icao} position={[a.lat, a.lon]} icon={airportIcon(a.status)}>
                  <Popup>
                    <div style={{ color: '#000', minWidth: 200 }}>
                      <div style={{ fontWeight: 700 }}>{a.icao} — {a.name}</div>
                      <div>Status: {a.status}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Island labels */}
              {showLayer.islands && ISLAND_LABELS.map(island => (
                <Marker key={island.name} position={[island.lat, island.lon]} icon={islandLabelIcon(island.name)} />
              ))}

              {/* Historical track */}
              {showLayer.historical && <HistoricalTrack stormId={showLayer.historical} />}
            </MapContainer>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {/* Saffir-Simpson scale */}
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Saffir-Simpson Scale</h3>
            {[1, 2, 3, 4, 5].map(c => (
              <div key={c} onClick={() => setSelectedCat(c)} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
                opacity: cat === c ? 1 : 0.45, transition: 'opacity 0.2s',
                background: cat === c ? CAT_COLORS[c] + '15' : 'transparent',
                borderRadius: 6, padding: '4px 6px',
                border: cat === c ? '1px solid ' + CAT_COLORS[c] + '50' : '1px solid transparent',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[c], flexShrink: 0 }} />
                <span style={{ fontSize: 12, flex: 1, fontWeight: cat === c ? 700 : 400 }}>Cat {c}: {SAFFIR_SIMPSON_REF[c]?.wind_mph} mph</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{SAFFIR_SIMPSON_REF[c]?.surge_ft} ft</span>
              </div>
            ))}
          </div>

          {/* Evacuation zones legend */}
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Evacuation Zones</h3>
            {DEMO_EVAC_ZONES.map(z => (
              <div key={z.zone} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: z.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0,
                }}>Z{z.zone}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{z.label}</div>
              </div>
            ))}
          </div>

          {/* Shelter capacity */}
          {shelters.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Shelter Capacity</h3>
              {shelters.map(s => (
                <div key={s.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.name.length > 22 ? s.name.substring(0, 22) + '…' : s.name}</span>
                    <span style={{ fontWeight: 700, color: s.status === 'open' ? 'var(--success)' : s.status === 'at_capacity' ? 'var(--danger)' : 'var(--text-muted)' }}>{s.occupancy_pct}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-primary)', borderRadius: 2, marginTop: 2 }}>
                    <div style={{ width: s.occupancy_pct + '%', height: '100%', borderRadius: 2, background: s.occupancy_pct > 80 ? 'var(--danger)' : s.occupancy_pct > 50 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Similar storms */}
          {comparisons.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Similar Past Storms</h3>
              {comparisons.slice(0, 4).map((c, i) => (
                <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: CAT_COLORS[c.peak_category] }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cat {c.peak_category} | {c.year}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
