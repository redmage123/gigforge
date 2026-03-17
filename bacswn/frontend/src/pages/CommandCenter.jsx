import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { useWebSocket } from '../hooks/useWebSocket'

// ── 1. Aircraft icon — bright yellow plane ──────────────────────────
const PLANE_D = 'M256 48 l20 120 l160 90 l-10 30 l-150-50 l0 130 l50 35 l0 30 l-70-20 l-70 20 l0-30 l50-35 l0-130 l-150 50 l-10-30 l160-90 Z'
function buildPlaneHtml(deg) {
  return '<div style="transform:rotate(' + deg + 'deg);width:32px;height:32px">'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32">'
    + '<path fill="#facc15" stroke="#000" stroke-width="20" d="' + PLANE_D + '"/>'
    + '</svg></div>'
}
const aircraftIcon = (track) => L.divIcon({
  className: 'aircraft-marker',
  html: buildPlaneHtml(track || 0),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// ── Station icon — radar tower ──────────────────────────────────────
const RADAR_SVG_D = 'M16 2 L16 10 M8 10 L24 10 M10 10 Q16 4 22 10 M6 12 L12 28 L20 28 L26 12 M4 28 L28 28'
const stationIcon = (category) => {
  const colors = { VFR: '#10b981', MVFR: '#3b82f6', IFR: '#ef4444', LIFR: '#a855f7' }
  const color = colors[category] || '#94a3b8'
  return L.divIcon({
    className: 'station-marker',
    html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28">'
      + '<path fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="' + RADAR_SVG_D + '"/>'
      + '<circle cx="16" cy="6" r="3" fill="' + color + '"/>'
      + '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="M9 3 Q16 -2 23 3" opacity="0.6"/>'
      + '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="M5 1 Q16 -5 27 1" opacity="0.35"/>'
      + '</svg>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

// ── Hurricane icon ──────────────────────────────────────────────────
const hurricaneIcon = L.divIcon({
  className: 'aircraft-marker',
  html: '<div class="hurricane-icon-pulse"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">'
    + '<circle cx="12" cy="12" r="3" fill="#ef4444"/>'
    + '<path fill="none" stroke="#ef4444" stroke-width="1.5" d="M12 2 C6 6 6 18 12 22 M12 2 C18 6 18 18 12 22 M2 12 C6 6 18 6 22 12 M2 12 C6 18 18 18 22 12" opacity="0.7"/>'
    + '</svg></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

// ── 2. Weather Radar Layer Component ────────────────────────────────
function WeatherRadarLayer({ visible }) {
  const map = useMap()
  const layerRef = useRef(null)
  const [tileUrl, setTileUrl] = useState(null)

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
      return
    }
    // Fetch latest RainViewer radar timestamp
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then(data => {
        const latest = data.radar?.past?.slice(-1)?.[0]
        if (latest) {
          const url = 'https://tilecache.rainviewer.com' + latest.path + '/256/{z}/{x}/{y}/4/1_1.png'
          setTileUrl(url)
        }
      })
      .catch(() => {})
  }, [visible, map])

  useEffect(() => {
    if (!tileUrl || !visible) return
    if (layerRef.current) map.removeLayer(layerRef.current)
    layerRef.current = L.tileLayer(tileUrl, { opacity: 0.55, zIndex: 10 })
    layerRef.current.addTo(map)
    return () => { if (layerRef.current) map.removeLayer(layerRef.current) }
  }, [tileUrl, visible, map])

  return null
}

// ── 5. Wind Animation Canvas Overlay ────────────────────────────────
function WindCanvas({ visible }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const particlesRef = useRef([])

  useEffect(() => {
    if (!visible) {
      if (canvasRef.current) { canvasRef.current.style.display = 'none' }
      cancelAnimationFrame(animRef.current)
      return
    }

    let canvas = canvasRef.current
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:5;pointer-events:none;'
      map.getContainer().appendChild(canvas)
      canvasRef.current = canvas
    }
    canvas.style.display = 'block'

    const resize = () => {
      const size = map.getSize()
      canvas.width = size.x
      canvas.height = size.y
    }
    resize()
    map.on('resize', resize)
    map.on('move', resize)

    // Initialize particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 200; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          speed: 0.3 + Math.random() * 1.5,
          angle: (Math.random() * 60 + 120) * Math.PI / 180, // mostly easterly trade winds
          life: Math.random() * 100,
          maxLife: 60 + Math.random() * 80,
        })
      }
    }

    const ctx = canvas.getContext('2d')
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particlesRef.current.forEach(p => {
        p.x += Math.cos(p.angle) * p.speed
        p.y += Math.sin(p.angle) * p.speed
        p.life++
        if (p.life > p.maxLife || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          p.x = Math.random() * canvas.width
          p.y = Math.random() * canvas.height
          p.life = 0
        }
        const alpha = Math.min(p.life / 10, 1 - p.life / p.maxLife) * 0.4
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - Math.cos(p.angle) * 8, p.y - Math.sin(p.angle) * 8)
        ctx.strokeStyle = 'rgba(147, 197, 253,' + alpha + ')'
        ctx.lineWidth = 1
        ctx.stroke()
      })
      animRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('resize', resize)
      map.off('move', resize)
    }
  }, [visible, map])

  return null
}

// ── 6. Altitude Slice Panel ─────────────────────────────────────────
function AltitudePanel({ flights, visible }) {
  if (!visible || flights.length === 0) return null
  const bands = [
    { label: 'FL400+', min: 12000, color: '#f59e0b' },
    { label: 'FL300-400', min: 9000, color: '#8b5cf6' },
    { label: 'FL200-300', min: 6000, color: '#3b82f6' },
    { label: 'FL100-200', min: 3000, color: '#06b6d4' },
    { label: '<FL100', min: 0, color: '#10b981' },
  ]
  return (
    <div className="altitude-panel">
      <div style={{fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)'}}>
        Altitude Slice
      </div>
      {bands.map(b => {
        const count = flights.filter(f => {
          const alt = f.altitude || 0
          const next = bands[bands.indexOf(b) - 1]
          return alt >= b.min && (!next || alt < next.min)
        }).length
        return (
          <div key={b.label} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
            <div style={{width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0}} />
            <span style={{fontSize: 11, color: 'var(--text-secondary)', width: 80}}>{b.label}</span>
            <div style={{flex: 1, height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden'}}>
              <div style={{width: (count / Math.max(flights.length, 1)) * 100 + '%', height: '100%', background: b.color, borderRadius: 3, transition: 'width 0.5s'}} />
            </div>
            <span style={{fontSize: 11, fontWeight: 700, color: b.color, width: 20, textAlign: 'right'}}>{count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 10. AI Weather Briefing Voice ───────────────────────────────────
function useBriefing(summary, flights, stations) {
  const [speaking, setSpeaking] = useState(false)

  const speak = useCallback(() => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return }
    const now = new Date()
    const hour = now.getUTCHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    const flightCount = summary?.command_center?.active_flights ?? flights.length
    const stationCount = summary?.command_center?.reporting_stations ?? stations.length
    const alertCount = summary?.command_center?.active_alerts ?? 0
    const vfrStations = stations.filter(s => s.flight_category === 'VFR').length
    const ifrStations = stations.filter(s => s.flight_category === 'IFR' || s.flight_category === 'LIFR').length

    let text = greeting + '. This is your Bahamas FIR automated weather briefing. '
    text += flightCount + ' aircraft are currently tracked in the airspace. '
    text += stationCount + ' weather stations are reporting. '
    if (vfrStations > 0) text += vfrStations + ' stations report V F R conditions. '
    if (ifrStations > 0) text += ifrStations + ' stations report I F R or lower. Caution advised. '
    if (alertCount > 0) text += alertCount + ' active weather advisories are in effect. '
    else text += 'No significant weather advisories at this time. '
    text += 'End of briefing.'

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.9
    utterance.pitch = 1.0
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    speechSynthesis.speak(utterance)
  }, [speaking, summary, flights, stations])

  return { speak, speaking }
}

// ── 4. Alert Sound ──────────────────────────────────────────────────
function useAlertSound() {
  const audioCtx = useRef(null)
  const play = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtx.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch (e) { /* audio not available */ }
  }, [])
  return play
}

// ── 9. SIGMET Animated Polygon ──────────────────────────────────────
function SigmetOverlays({ sigmets }) {
  // Show pulsing circles for active SIGMETs over the Bahamas area
  if (!sigmets || sigmets.length === 0) return null
  const hazardColors = {
    TS: '#ef4444', TURB: '#f59e0b', ICE: '#06b6d4',
    VA: '#8b5cf6', TC: '#ec4899', CB: '#ef4444',
  }
  // Place SIGMET indicators at approximate locations
  return sigmets.slice(0, 5).map((s, i) => {
    const lat = 23 + i * 1.2
    const lon = -76 + i * 0.8
    const color = hazardColors[s.hazard] || hazardColors.TS
    return (
      <Circle key={i} center={[lat, lon]} radius={80000}
        pathOptions={{
          color: color, fillColor: color, fillOpacity: 0.15,
          weight: 2, dashArray: '6 4',
          className: 'sigmet-pulse',
        }}
      />
    )
  })
}

// ── Map Legend ──────────────────────────────────────────────────────
function MapLegend({ visible }) {
  const [open, setOpen] = useState(true)
  if (!visible) return null
  return (
    <div className="map-legend">
      <div className="map-legend-header" onClick={() => setOpen(!open)} style={{cursor: 'pointer'}}>
        <span style={{fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1}}>Legend</span>
        <span style={{fontSize: 10}}>{open ? '▼' : '▶'}</span>
      </div>
      {open && (
        <div className="map-legend-body">
          <div className="legend-item">
            <svg width="18" height="18" viewBox="0 0 512 512"><path fill="#facc15" stroke="#000" strokeWidth="30" d="M256 48 l20 120 l160 90 l-10 30 l-150-50 l0 130 l50 35 l0 30 l-70-20 l-70 20 l0-30 l50-35 l0-130 l-150 50 l-10-30 l160-90 Z"/></svg>
            <span>Aircraft (heading shown)</span>
          </div>
          <div className="legend-item">
            <div style={{width: 14, height: 14, borderRadius: '50%', background: '#10b981', border: '2px solid white'}} />
            <span>Station — VFR</span>
          </div>
          <div className="legend-item">
            <div style={{width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', border: '2px solid white'}} />
            <span>Station — MVFR</span>
          </div>
          <div className="legend-item">
            <div style={{width: 14, height: 14, borderRadius: '50%', background: '#ef4444', border: '2px solid white'}} />
            <span>Station — IFR</span>
          </div>
          <div className="legend-item">
            <div style={{width: 14, height: 14, borderRadius: '50%', background: '#a855f7', border: '2px solid white'}} />
            <span>Station — LIFR</span>
          </div>
          <div className="legend-item">
            <div style={{width: 24, height: 3, background: '#facc15', opacity: 0.5, borderRadius: 1}} />
            <span>Flight trail</span>
          </div>
          <div className="legend-item">
            <div style={{width: 24, height: 3, background: '#3b82f6', borderRadius: 1, borderTop: '2px dashed #3b82f6'}} />
            <span>FIR boundary</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 18, borderRadius: '50%', border: '2px dashed #ef4444', opacity: 0.7}} />
            <span>SIGMET hazard zone</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 18, borderRadius: '50%', border: '2px dashed #f59e0b', opacity: 0.7}} />
            <span>Storm surge zone</span>
          </div>
          <div className="legend-item">
            <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#ef4444"/><path fill="none" stroke="#ef4444" strokeWidth="1.5" d="M12 2 C6 6 6 18 12 22 M12 2 C18 6 18 18 12 22" opacity="0.7"/></svg>
            <span>Tropical cyclone</span>
          </div>
          <div className="legend-item">
            <div style={{width: 24, height: 3, borderTop: '2px dashed #ef4444'}} />
            <span>Hurricane forecast track</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 12, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 2}} />
            <span>Cone of uncertainty</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 11. Timelapse Controller ────────────────────────────────────────
function TimelapseBar({ snapshots, active, onToggle, currentIdx, onSeek }) {
  if (!active) return null
  return (
    <div className="timelapse-bar">
      <span style={{fontSize: 11, color: 'var(--text-muted)', marginRight: 8}}>REPLAY</span>
      <input type="range" min={0} max={Math.max(snapshots.length - 1, 0)} value={currentIdx}
        onChange={e => onSeek(parseInt(e.target.value))}
        style={{flex: 1, accentColor: 'var(--accent)'}} />
      <span style={{fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8}}>
        {snapshots[currentIdx]?.time || '--:--'}
      </span>
    </div>
  )
}

function useTimelapse(flights) {
  const [snapshots, setSnapshots] = useState([])
  const [active, setActive] = useState(false)
  const [idx, setIdx] = useState(0)

  // Record snapshots every poll
  useEffect(() => {
    if (flights.length > 0) {
      setSnapshots(prev => {
        const snap = { flights: [...flights], time: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) }
        const updated = [...prev, snap].slice(-30) // Keep last 30
        return updated
      })
    }
  }, [flights])

  const displayFlights = active && snapshots[idx] ? snapshots[idx].flights : flights

  return { snapshots, active, setActive, idx, setIdx, displayFlights }
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────
export default function CommandCenter() {
  const { data, loading } = usePolling(useCallback(() => api.mapLayers(), []), 15000)
  const { data: summary } = usePolling(useCallback(() => api.dashboardSummary(), []), 30000)
  const alertWs = useWebSocket('alerts')
  const playAlert = useAlertSound()

  // State for layer toggles
  const [showRadar, setShowRadar] = useState(false)
  const [showWind, setShowWind] = useState(false)
  const [showAltitude, setShowAltitude] = useState(true)
  const [showTrails, setShowTrails] = useState(true)
  const [showHurricanes, setShowHurricanes] = useState(true)
  const [showSigmets, setShowSigmets] = useState(true)

  const flights = data?.flights || []
  const stations = data?.stations || []
  const firPolygon = data?.fir_polygon || []
  const sigmets = data?.sigmets || []
  const hurricanes = data?.hurricanes || []

  const firLatLngs = firPolygon.map(([lon, lat]) => [lat, lon])

  // Timelapse
  const timelapse = useTimelapse(flights)
  const displayFlights = timelapse.displayFlights

  // Flight trails — store previous positions
  const trailsRef = useRef({})
  useEffect(() => {
    flights.forEach(f => {
      if (!trailsRef.current[f.icao24]) trailsRef.current[f.icao24] = []
      trailsRef.current[f.icao24].push([f.lat, f.lon])
      if (trailsRef.current[f.icao24].length > 8) trailsRef.current[f.icao24].shift()
    })
  }, [flights])

  // Briefing voice
  const { speak, speaking } = useBriefing(summary, flights, stations)

  // 4. Audible alert on new WS alert
  useEffect(() => {
    if (alertWs.lastMessage) playAlert()
  }, [alertWs.lastMessage, playAlert])

  // 12. Wallboard mode
  const [wallboard, setWallboard] = useState(false)

  return (
    <div className={wallboard ? 'wallboard-mode' : ''}>
      <div className="page-header">
        <div>
          <h2>Command Center</h2>
          <p className="subtitle">Real-time operational overview — Bahamas FIR</p>
        </div>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <button className="btn btn-sm" onClick={speak}
            style={{background: speaking ? 'var(--danger)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)'}}>
            {speaking ? '⏹ Stop' : '🔊 Briefing'}
          </button>
          <button className="btn btn-sm" onClick={() => setWallboard(!wallboard)}
            style={{background: wallboard ? 'var(--accent)' : 'var(--bg-card)', color: wallboard ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border)'}}>
            🖥 Kiosk
          </button>
          <div className="live-badge"><div className="live-dot" /> LIVE</div>
        </div>
      </div>

      {/* Stats row */}
      {!wallboard && (
        <div className="card-grid" style={{marginBottom: 16}}>
          <div className="stat-card">
            <span className="stat-label">Active Flights</span>
            <span className="stat-value accent">{summary?.command_center?.active_flights ?? flights.length}</span>
            <span className="stat-detail">Aircraft in Bahamas FIR</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Stations Reporting</span>
            <span className="stat-value success">{summary?.command_center?.reporting_stations ?? stations.length}</span>
            <span className="stat-detail">Weather observation points</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Alerts</span>
            <span className="stat-value warning">{summary?.command_center?.active_alerts ?? 0}</span>
            <span className="stat-detail">NWS + SIGMET advisories</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">AI Agents</span>
            <span className="stat-value info">{summary?.agents?.total ?? 7}</span>
            <span className="stat-detail">{summary?.agents?.running ?? 0} running</span>
          </div>
        </div>
      )}

      {/* Layer toggle bar */}
      <div className="layer-toggles">
        <label><input type="checkbox" checked={showRadar} onChange={() => setShowRadar(!showRadar)} /> Radar</label>
        <label><input type="checkbox" checked={showWind} onChange={() => setShowWind(!showWind)} /> Wind</label>
        <label><input type="checkbox" checked={showTrails} onChange={() => setShowTrails(!showTrails)} /> Trails</label>
        <label><input type="checkbox" checked={showHurricanes} onChange={() => setShowHurricanes(!showHurricanes)} /> Cyclones</label>
        <label><input type="checkbox" checked={showSigmets} onChange={() => setShowSigmets(!showSigmets)} /> SIGMETs</label>
        <label><input type="checkbox" checked={showAltitude} onChange={() => setShowAltitude(!showAltitude)} /> Altitude</label>
        <label><input type="checkbox" checked={timelapse.active} onChange={() => timelapse.setActive(!timelapse.active)} /> Replay</label>
      </div>

      {/* Timelapse bar */}
      <TimelapseBar snapshots={timelapse.snapshots} active={timelapse.active}
        onToggle={() => timelapse.setActive(!timelapse.active)}
        currentIdx={timelapse.idx} onSeek={timelapse.setIdx} />

      {/* Map + Altitude Panel */}
      <div style={{display: 'flex', gap: 12}}>
        <div className="card" style={{padding: 0, overflow: 'hidden', flex: 1}}>
          <div className="map-container" style={wallboard ? {height: 'calc(100vh - 80px)'} : {}}>
            {loading && !data ? (
              <div className="loading-spinner"><div className="spinner" /></div>
            ) : (
              <MapContainer center={[24.5, -76.5]} zoom={7} style={{height: '100%', width: '100%'}}
                zoomControl={true} attributionControl={false}
                minZoom={5} maxZoom={18} scrollWheelZoom={true} dragging={true}>
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; Esri'
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; Esri'
                />

                {/* 2. Weather Radar Overlay */}
                <WeatherRadarLayer visible={showRadar} />

                {/* 5. Wind Animation */}
                <WindCanvas visible={showWind} />

                {/* FIR boundary */}
                {firLatLngs.length > 0 && (
                  <Polygon positions={firLatLngs}
                    pathOptions={{color: '#3b82f6', weight: 2, fillOpacity: 0.05, dashArray: '8 4'}} />
                )}

                {/* 9. SIGMET overlays */}
                {showSigmets && <SigmetOverlays sigmets={sigmets} />}

                {/* 7. Hurricane tracks */}
                {showHurricanes && hurricanes.map(h => (
                  <span key={h.id}>
                    <Marker position={[h.lat, h.lon]} icon={hurricaneIcon}>
                      <Popup>
                        <div style={{color: '#000', minWidth: 200}}>
                          <div style={{fontWeight: 700, fontSize: 15, color: '#dc2626'}}>{h.name}</div>
                          <div>{h.classification}</div>
                          <div><strong>Winds:</strong> {h.wind_mph} mph</div>
                          <div><strong>Pressure:</strong> {h.pressure_mb} mb</div>
                          <div><strong>Movement:</strong> {h.movement}</div>
                        </div>
                      </Popup>
                    </Marker>
                    {/* Forecast track line */}
                    {h.forecast_track && h.forecast_track.length > 1 && (
                      <Polyline positions={h.forecast_track.map(p => [p.lat, p.lon])}
                        pathOptions={{color: '#ef4444', weight: 3, dashArray: '8 6', opacity: 0.8}} />
                    )}
                    {/* Cone of uncertainty */}
                    {h.cone_polygon && h.cone_polygon.length > 2 && (
                      <Polygon positions={h.cone_polygon}
                        pathOptions={{color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.1, dashArray: '4 4'}} />
                    )}
                  </span>
                ))}

                {/* Weather stations */}
                {stations.map(s => (
                  <Marker key={s.icao} position={[s.lat, s.lon]}
                    icon={stationIcon(s.flight_category)}>
                    <Popup>
                      <div style={{color: '#000', minWidth: 240, fontSize: 13, lineHeight: 1.6}}>
                        <div style={{fontWeight: 700, fontSize: 15, marginBottom: 4, borderBottom: '1px solid #ddd', paddingBottom: 4}}>
                          {s.icao} — {s.name}
                        </div>
                        <div><strong>Flight Category:</strong>{' '}
                          <span style={{
                            padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 12,
                            background: s.flight_category === 'VFR' ? '#d1fae5' : s.flight_category === 'MVFR' ? '#dbeafe' : s.flight_category === 'IFR' ? '#fee2e2' : s.flight_category === 'LIFR' ? '#ede9fe' : '#f1f5f9',
                            color: s.flight_category === 'VFR' ? '#065f46' : s.flight_category === 'MVFR' ? '#1e40af' : s.flight_category === 'IFR' ? '#991b1b' : s.flight_category === 'LIFR' ? '#5b21b6' : '#64748b',
                          }}>{s.flight_category || 'N/A'}</span>
                        </div>
                        {s.temp_c != null && <div><strong>Temperature:</strong> {s.temp_c}°C ({Math.round(s.temp_c * 9/5 + 32)}°F)</div>}
                        {s.dewpoint_c != null && <div><strong>Dewpoint:</strong> {s.dewpoint_c}°C</div>}
                        {s.wind_speed_kt != null && <div><strong>Wind:</strong> {s.wind_dir_deg != null ? s.wind_dir_deg + '° at ' : ''}{s.wind_speed_kt} kt{s.wind_gust_kt ? ' G' + s.wind_gust_kt : ''}</div>}
                        {s.visibility_sm != null && <div><strong>Visibility:</strong> {s.visibility_sm} SM</div>}
                        {s.altimeter_inhg != null && <div><strong>Altimeter:</strong> {s.altimeter_inhg} inHg</div>}
                        {s.elevation_ft != null && <div><strong>Elevation:</strong> {s.elevation_ft} ft</div>}
                        <div><strong>Coordinates:</strong> {s.lat.toFixed(3)}°N, {Math.abs(s.lon).toFixed(3)}°W</div>
                        {/* 8. Mini sparkline (temperature indicator bar) */}
                        {s.temp_c != null && (
                          <div style={{marginTop: 6}}>
                            <div style={{fontSize: 10, color: '#666', marginBottom: 2}}>Temp gauge</div>
                            <div style={{height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden'}}>
                              <div style={{
                                width: Math.min(100, Math.max(5, (s.temp_c + 10) / 50 * 100)) + '%',
                                height: '100%', borderRadius: 4,
                                background: s.temp_c > 35 ? '#ef4444' : s.temp_c > 25 ? '#f59e0b' : s.temp_c > 15 ? '#10b981' : '#3b82f6',
                              }} />
                            </div>
                          </div>
                        )}
                        {s.raw_metar && (
                          <code style={{fontSize: 10, display: 'block', marginTop: 6, padding: 6, background: '#f0fdf4', borderRadius: 4, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#166534'}}>
                            {s.raw_metar}
                          </code>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* 1. Flight trails */}
                {showTrails && Object.entries(trailsRef.current).map(([id, trail]) => (
                  trail.length > 1 ? (
                    <Polyline key={'trail-' + id} positions={trail}
                      pathOptions={{color: '#facc15', weight: 1.5, opacity: 0.35, dashArray: '4 4'}} />
                  ) : null
                ))}

                {/* Aircraft */}
                {displayFlights.map(f => (
                  <Marker key={f.icao24} position={[f.lat, f.lon]}
                    icon={aircraftIcon(f.track)}>
                    <Popup>
                      <div style={{color: '#000', minWidth: 200, fontSize: 13, lineHeight: 1.6}}>
                        <div style={{fontWeight: 700, fontSize: 15, marginBottom: 4, borderBottom: '1px solid #ddd', paddingBottom: 4}}>
                          {f.callsign || f.icao24}
                        </div>
                        <div><strong>Country:</strong> {f.origin_country}</div>
                        <div><strong>Altitude:</strong> {f.altitude ? Math.round(f.altitude * 3.281) + ' ft (' + Math.round(f.altitude) + 'm)' : 'GND'}</div>
                        <div><strong>Speed:</strong> {f.velocity ? Math.round(f.velocity * 1.944) + ' kt' : 'N/A'}</div>
                        <div><strong>Track:</strong> {f.track ? Math.round(f.track) + '°' : 'N/A'}</div>
                        {f.vertical_rate != null && f.vertical_rate !== 0 && (
                          <div style={{color: f.vertical_rate > 0 ? '#16a34a' : '#dc2626'}}>
                            <strong>V/S:</strong> {f.vertical_rate > 0 ? '+' : ''}{Math.round(f.vertical_rate * 196.85)} fpm
                          </div>
                        )}
                        <div><strong>Category:</strong> {f.category || 'unknown'}</div>
                        <div style={{fontSize: 10, color: '#999', marginTop: 4}}>ICAO24: {f.icao24}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
            <MapLegend visible={true} />
          </div>
        </div>

        {/* 6. Altitude slice panel */}
        {showAltitude && !wallboard && (
          <div style={{width: 220, flexShrink: 0}}>
            <AltitudePanel flights={displayFlights} visible={showAltitude} />
          </div>
        )}
      </div>
    </div>
  )
}
