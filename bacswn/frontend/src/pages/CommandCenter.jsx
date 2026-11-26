/**
 * Command Center page (the app's home route).
 *
 * What: the real-time operational picture of the Bahamas FIR: a Leaflet map with
 * aircraft, weather stations, FIR boundary, SIGMETs, tropical cyclones (track and cone),
 * mesh hazards and predicted aircraft conflicts, comms links, optional radar and wind
 * overlays, flight trails and a replay slider; plus summary stats, an altitude slice,
 * the operational alert centre, a spoken/text weather briefing, mesh traffic and
 * accessible data tables of everything on the map.
 * Why: the duty forecaster's single situational-awareness screen, also usable as a
 * wall display (kiosk mode).
 * How: polls `api.mapLayers()` (15 s), `api.dashboardSummary()` (30 s),
 * `api.meshAirspace()` (5 s) and, while comms links are shown, `api.meshStatus()` (5 s).
 * useOperationalAlerts merges WebSocket SIGMETs/alerts with mesh hazards and conflicts
 * into one alert list. Radar tiles come from RainViewer. The map is supplemented by
 * SituationTables, which is the keyboard/screen-reader equivalent of the markers.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { useWebSocket } from '../hooks/useWebSocket'
import { useA11yPrefs, usePrefersReducedMotion } from '../hooks/useA11yPrefs'
import AlertCenter, { useChime } from '../components/command/AlertCenter'
import AlertDetails from '../components/command/AlertDetails'
import BriefingPanel, { buildBriefing } from '../components/command/BriefingPanel'
import SituationTables from '../components/command/SituationTables'
import MeshTrafficPanel, { MeshHazardLayers } from '../components/command/MeshTraffic'
import LiveBadge from '../components/LiveBadge'
import ResetViewControl from '../components/map/ResetViewControl'
import { PLANE_D } from '../components/map/plane'
import { CommsLinksLayer, CommsFilterControl, useCommsFilter, visibleLinks } from '../components/map/CommsChannels'

// ── 1. Aircraft icon — bright yellow plane ──────────────────────────
/**
 * HTML for the yellow plane glyph rotated to a heading.
 * @param {number} deg heading in degrees
 * @returns {string}
 */
function buildPlaneHtml(deg) {
  return '<div style="transform:rotate(' + deg + 'deg);width:32px;height:32px">'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32">'
    + '<path fill="#facc15" stroke="#000" stroke-width="20" d="' + PLANE_D + '"/>'
    + '</svg></div>'
}
/** Leaflet divIcon for an aircraft pointing along `track` (degrees; 0 if unknown). */
const aircraftIcon = (track) => L.divIcon({
  className: 'aircraft-marker',
  html: buildPlaneHtml(track || 0),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// ── Station icon — radar tower ──────────────────────────────────────
/** Flight-category colour (marker outline, legend swatch). */
const CAT_COLORS = { VFR: '#10b981', MVFR: '#3b82f6', IFR: '#ef4444', LIFR: '#a855f7' }

/** SVG path of the radar-tower glyph used for station markers. */
const RADAR_SVG_D = 'M16 2 L16 10 M8 10 L24 10 M10 10 Q16 4 22 10 M6 12 L12 28 L20 28 L26 12 M4 28 L28 28'
/**
 * Leaflet divIcon for a weather station: a radar tower coloured by flight category,
 * with the category printed under the tower so it never relies on colour alone (WCAG 1.4.1).
 * A "~" prefix and `est` class mark a model estimate rather than an observation.
 * @param {string} [category] VFR | MVFR | IFR | LIFR
 * @param {string} [source] 'metar' (observed) or 'model' (estimate)
 * @returns {L.DivIcon}
 */
const stationIcon = (category, source) => {
  const color = CAT_COLORS[category] || '#94a3b8'
  return L.divIcon({
    className: 'station-marker',
    // "~" marks a model estimate (not an observation) — in text, not just styling.
    html: '<span class="station-cat' + (source === 'model' ? ' est' : '') + '" style="border-color:' + color + '">'
      + (source === 'model' && category ? '~' : '') + (category || 'N/A') + '</span>'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">'
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
/** Pulsing red cyclone marker for tropical cyclones. */
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
/**
 * Leaflet child that adds the latest RainViewer radar mosaic as a semi-transparent tile
 * layer while `visible`. Fetch failures are ignored (the layer simply doesn't appear).
 * @param {{visible: boolean}} props
 */
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
/**
 * Leaflet child that draws 200 drifting streaks over the map, mostly from the east
 * (illustrative trade winds, not observed wind data). Under reduced motion it draws a
 * single static frame. Hidden, not destroyed, when toggled off.
 * @param {{visible: boolean, reducedMotion: boolean}} props
 */
function WindCanvas({ visible, reducedMotion }) {
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

    /** Matches the canvas size to the map's. */
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
    /** Advances and draws every particle; respawns those that expire or leave the view. */
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
      // Reduced motion: draw one static frame of wind streaks instead of animating.
      if (!reducedMotion) animRef.current = requestAnimationFrame(animate)
    }
    if (reducedMotion) particlesRef.current.forEach(p => { p.life = p.maxLife / 2 })
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      map.off('resize', resize)
      map.off('move', resize)
    }
  }, [visible, map, reducedMotion])

  return null
}

// ── Map keyboard/AT labelling ────────────────────────────────────────
/**
 * Leaflet child that names the map container (a Tab stop for keyboard panning) and
 * gives instructions, instead of the concatenated text of every marker. Renders nothing.
 */
function MapA11y() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    el.setAttribute('aria-label', 'Interactive map. Arrow keys pan, plus and minus keys zoom.')
    el.setAttribute('aria-roledescription', 'map')
  }, [map])
  return null
}

/**
 * Leaflet child that centres the map (zoom 8 or closer) on a point chosen from an alert
 * ("Show on map"); flies there unless reduced motion is preferred. Renders nothing.
 * @param {{focus: {lat: number, lon: number}|null, reducedMotion: boolean}} props
 */
function MapFocus({ focus, reducedMotion }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    const zoom = Math.max(map.getZoom(), 8)
    if (reducedMotion) map.setView([focus.lat, focus.lon], zoom)
    else map.flyTo([focus.lat, focus.lon], zoom, { duration: 0.8 })
  }, [focus, map, reducedMotion])
  return null
}

// ── 6. Altitude Slice Panel ─────────────────────────────────────────
/** Altitude bands, highest first; `min` is the lower bound in metres. */
const ALTITUDE_BANDS = [
  { label: 'FL400+', min: 12000, color: '#f59e0b' },
  { label: 'FL300-400', min: 9000, color: '#8b5cf6' },
  { label: 'FL200-300', min: 6000, color: '#3b82f6' },
  { label: 'FL100-200', min: 3000, color: '#06b6d4' },
  { label: '<FL100', min: 0, color: '#10b981' },
]

/**
 * Side panel counting aircraft per altitude band, with a proportional bar for each.
 * @param {{flights: object[], visible: boolean}} props flights use `altitude` in metres
 */
function AltitudePanel({ flights, visible }) {
  if (!visible || flights.length === 0) return null
  const bands = ALTITUDE_BANDS
  return (
    <section className="altitude-panel" aria-labelledby="alt-slice-h">
      <h3 id="alt-slice-h" style={{fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)'}}>
        Altitude Slice
      </h3>
      <ul style={{listStyle: 'none', margin: 0, padding: 0}}>
      {bands.map((b, i) => {
        const count = flights.filter(f => {
          const alt = f.altitude || 0
          const next = bands[i - 1]
          return alt >= b.min && (!next || alt < next.min)
        }).length
        return (
          <li key={b.label} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}
            aria-label={`${b.label}: ${count} aircraft`}>
            <div aria-hidden="true" style={{width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0}} />
            <span style={{fontSize: 11, color: 'var(--text-secondary)', width: 80}}>{b.label}</span>
            <div aria-hidden="true" style={{flex: 1, height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden'}}>
              <div style={{width: (count / Math.max(flights.length, 1)) * 100 + '%', height: '100%', background: b.color, borderRadius: 3, transition: 'width 0.5s'}} />
            </div>
            <span style={{fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', width: 20, textAlign: 'right'}}>{count}</span>
          </li>
        )
      })}
      </ul>
    </section>
  )
}

// ── 9. SIGMET Animated Polygon ──────────────────────────────────────
/**
 * Pulsing dashed circles for up to five active SIGMETs, coloured by hazard.
 * Positions are placeholders spread across the Bahamas, not the SIGMET's real area.
 * @param {{sigmets: object[]}} props
 */
function SigmetOverlays({ sigmets }) {
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
/**
 * Collapsible map legend (collapsed by default on phones, where it would cover the map).
 * @param {{visible: boolean}} props
 */
function MapLegend({ visible }) {
  const [open, setOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches))
  if (!visible) return null
  return (
    <div className="map-legend">
      <button type="button" className="map-legend-header" onClick={() => setOpen(!open)}
        aria-expanded={open} aria-controls="map-legend-body">
        <span style={{fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1}}>Legend</span>
        <span style={{fontSize: 10}} aria-hidden="true">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="map-legend-body" id="map-legend-body">
          <div className="legend-item">
            <svg width="18" height="18" viewBox="0 0 512 512" aria-hidden="true"><path fill="#facc15" stroke="#000" strokeWidth="30" d="M256 48 l20 120 l160 90 l-10 30 l-150-50 l0 130 l50 35 l0 30 l-70-20 l-70 20 l0-30 l50-35 l0-130 l-150 50 l-10-30 l160-90 Z"/></svg>
            <span>Aircraft (heading shown)</span>
          </div>
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <div className="legend-item" key={cat}>
              <span className="station-cat legend-cat" style={{borderColor: color}}>{cat}</span>
              <span>Station — {cat}</span>
            </div>
          ))}
          <div className="legend-item">
            <span className="station-cat legend-cat est" style={{borderColor: CAT_COLORS.VFR}}>~VFR</span>
            <span>~ = model estimate, not observed</span>
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
            <div style={{width: 18, height: 18, borderRadius: '50%', border: '3px solid #ef4444', background: 'rgba(239,68,68,0.25)'}} />
            <span>Mesh hazard — confirmed</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 18, borderRadius: '50%', border: '2px dashed #f59e0b', background: 'rgba(245,158,11,0.12)'}} />
            <span>Mesh hazard — not yet verified</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 0, borderTop: '3px dotted #f87171'}} />
            <span>Aircraft path into a hazard</span>
          </div>
          <div className="legend-item">
            <div style={{width: 18, height: 18, borderRadius: '50%', border: '2px dashed #f59e0b', opacity: 0.7}} />
            <span>Storm surge zone</span>
          </div>
          <div className="legend-item">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="#ef4444"/><path fill="none" stroke="#ef4444" strokeWidth="1.5" d="M12 2 C6 6 6 18 12 22 M12 2 C18 6 18 18 12 22" opacity="0.7"/></svg>
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

// ── Map popups ──────────────────────────────────────────────────────
/** Popup badge colours (light background / dark text) per flight category. */
const CAT_BADGE = {
  VFR: { background: '#d1fae5', color: '#065f46' },
  MVFR: { background: '#dbeafe', color: '#1e40af' },
  IFR: { background: '#fee2e2', color: '#991b1b' },
  LIFR: { background: '#ede9fe', color: '#5b21b6' },
}
/** Popup badge colours when the category is missing or unknown. */
const CAT_BADGE_NONE = { background: '#f1f5f9', color: '#64748b' }

/**
 * Altitude in whole feet.
 * @param {number} metres
 * @returns {number}
 */
const feet = (metres) => Math.round(metres * 3.281)

/**
 * Popup for a weather station marker: flight category, latest METAR values, a simple
 * temperature gauge and the raw METAR.
 * @param {{s: object}} props station from `api.mapLayers().stations`
 */
function StationPopup({ s }) {
  return (
    <div style={{color: '#000', minWidth: 240, fontSize: 13, lineHeight: 1.6}}>
      <div style={{fontWeight: 700, fontSize: 15, marginBottom: 4, borderBottom: '1px solid #ddd', paddingBottom: 4}}>
        {s.icao} — {s.name}
      </div>
      <div><strong>Flight Category:</strong>{' '}
        <span style={{
          padding: '1px 6px', borderRadius: 3, fontWeight: 700, fontSize: 12,
          ...(CAT_BADGE[s.flight_category] || CAT_BADGE_NONE),
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
  )
}

/**
 * Popup for an aircraft marker: country, altitude, speed, track, vertical speed,
 * category and ICAO24 address.
 * @param {{f: object}} props flight from `api.mapLayers().flights`
 */
function AircraftPopup({ f }) {
  return (
    <div style={{color: '#000', minWidth: 200, fontSize: 13, lineHeight: 1.6}}>
      <div style={{fontWeight: 700, fontSize: 15, marginBottom: 4, borderBottom: '1px solid #ddd', paddingBottom: 4}}>
        {f.callsign || f.icao24}
      </div>
      <div><strong>Country:</strong> {f.origin_country}</div>
      <div><strong>Altitude:</strong> {f.altitude ? feet(f.altitude) + ' ft (' + Math.round(f.altitude) + 'm)' : 'GND'}</div>
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
  )
}

// ── 11. Timelapse Controller ────────────────────────────────────────
/**
 * Replay slider over the recorded flight snapshots; shown only while replay is active.
 * @param {object} props
 * @param {object[]} props.snapshots recorded snapshots ({flights, time})
 * @param {boolean} props.active replay mode on
 * @param {function} props.onToggle toggles replay (currently unused by the bar itself)
 * @param {number} props.currentIdx selected snapshot index
 * @param {function(number): void} props.onSeek called with the new index
 */
function TimelapseBar({ snapshots, active, onToggle, currentIdx, onSeek }) {
  if (!active) return null
  return (
    <div className="timelapse-bar">
      <label htmlFor="replay-slider" style={{fontSize: 11, color: 'var(--text-muted)', marginRight: 8}}>REPLAY</label>
      <input id="replay-slider" type="range" min={0} max={Math.max(snapshots.length - 1, 0)} value={currentIdx}
        aria-valuetext={`${snapshots[currentIdx]?.time || 'no snapshot'}, ${snapshots[currentIdx]?.flights?.length ?? 0} aircraft`}
        onChange={e => onSeek(parseInt(e.target.value))}
        style={{flex: 1, accentColor: 'var(--accent)'}} />
      <span style={{fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8}}>
        {snapshots[currentIdx]?.time || '--:--'}
      </span>
    </div>
  )
}

/**
 * Records a snapshot of the flights on every poll (last 30 kept) and, while replay is
 * active, returns the selected snapshot's flights instead of the live ones.
 * @param {object[]} flights live flights
 * @returns {{snapshots: object[], active: boolean, setActive: function, idx: number, setIdx: function, displayFlights: object[]}}
 */
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

/**
 * Collects operational alerts for the Command Center from three sources: SIGMETs pushed
 * over the `sigmets` WebSocket, the `alerts` WebSocket feed, and the mesh airspace
 * picture (confirmed hazards, and confirmed-hazard conflicts within 15 minutes). Alerts
 * are de-duplicated by id, newest first, capped at 50; a chime plays for each new one
 * when the user has alert sounds on. Mesh alerts dismiss themselves (marked `cleared`)
 * once their hazard or conflict is over, so "active" means "needs attention now".
 * @param {object|null} airspace latest `api.meshAirspace()` payload
 * @param {object} prefs accessibility preferences (reads `alertSound`)
 * @returns {{alerts: object[], setAlerts: function, dismissAlert: function(string): void, simSigmets: object[]}}
 *   `simSigmets` are the still-valid SIGMETs received over the WebSocket
 */
function useOperationalAlerts(airspace, prefs) {
  const alertWs = useWebSocket('alerts')
  const sigmetWs = useWebSocket('sigmets')
  const [simSigmets, setSimSigmets] = useState([])

  const chime = useChime()
  const [alerts, setAlerts] = useState([])
  /** Adds an alert (stamped now, not dismissed) unless one with the same id already exists. */
  const pushAlert = useCallback((a) => {
    setAlerts(prev => prev.some(x => x.id === a.id) ? prev : [{ ...a, time: new Date(), dismissed: false }, ...prev].slice(0, 50))
  }, [])
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const lastAlertId = useRef(null)
  useEffect(() => {
    const newest = alerts[0]
    if (!newest || newest.id === lastAlertId.current) return
    lastAlertId.current = newest.id
    if (prefsRef.current.alertSound) chime()
  }, [alerts, chime])

  useEffect(() => {
    if (sigmetWs.lastMessage && sigmetWs.lastMessage.type === 'new_sigmet') {
      const s = sigmetWs.lastMessage.sigmet
      setSimSigmets(prev => {
        const active = prev.filter(x => x.id !== s.id && x.valid_to > new Date().toISOString())
        return [...active, s]
      })
      const sev = String(s.severity || '').toLowerCase()
      pushAlert({
        id: 'sigmet-' + s.id,
        title: `New SIGMET — ${s.hazard_name || s.hazard_type}`,
        detail: [s.severity && `${s.severity} intensity`, `FL${s.fl_base}–FL${s.fl_top}`, s.area,
          s.valid_to && `valid to ${String(s.valid_to).slice(11, 16)}Z`].filter(Boolean).join(', '),
        severity: sev.includes('sev') ? 'severe' : sev.includes('mod') ? 'moderate' : 'high',
        source: 'SIGMET',
      })
    }
  }, [sigmetWs.lastMessage, pushAlert])

  useEffect(() => {
    const m = alertWs.lastMessage
    if (!m || typeof m !== 'object') return
    pushAlert({
      id: 'alert-' + (m.id ?? m.timestamp ?? Date.now()),
      title: m.title || m.event || m.headline || 'Weather alert',
      detail: m.detail || m.description || m.message || m.area || '',
      severity: String(m.severity || 'high').toLowerCase(),
      source: m.source || 'Alerts feed',
    })
  }, [alertWs.lastMessage, pushAlert])

  // Mesh → air traffic: confirmed hazards and imminent conflicts become operational alerts.
  useEffect(() => {
    if (!airspace) return
    // Mesh alerts clear themselves once the hazard or conflict is over, so "active" means "needs attention now".
    const liveIds = new Set([
      ...airspace.hazards.filter(h => h.status === 'confirmed').map(h => 'mesh-hz-' + h.id),
      ...airspace.conflicts.map(c => 'mesh-cf-' + c.icao24 + '-' + c.hazard_id),
    ])
    setAlerts(prev => prev.some(a => !a.dismissed && a.id.startsWith('mesh-') && !liveIds.has(a.id))
      ? prev.map(a => (!a.dismissed && a.id.startsWith('mesh-') && !liveIds.has(a.id)) ? { ...a, dismissed: true, cleared: true } : a)
      : prev)
    airspace.hazards.filter(h => h.status === 'confirmed').forEach(h => pushAlert({
      id: 'mesh-hz-' + h.id,
      title: `Mesh: ${h.kind} ${h.id} confirmed`,
      detail: `${h.basis}. ${h.radius_nm} nm radius, moving ${h.speed_kt} kt.`,
      severity: h.kind === 'IFR' ? 'moderate' : 'severe',
      source: 'Mesh network',
      hazard: h,
    }))
    // Only hazards the mesh has verified raise conflict alerts; unverified ones stay on the map and
    // flight list. Too many alarms makes a healthy system look broken, and trains people to ignore them.
    airspace.conflicts.filter(c => c.minutes_to_entry <= 15 && c.hazard_status === 'confirmed').forEach(c => pushAlert({
      id: 'mesh-cf-' + c.icao24 + '-' + c.hazard_id,
      title: c.inside ? `${c.callsign} is inside a ${c.hazard} area` : `${c.callsign} enters ${c.hazard} in ${c.minutes_to_entry} min`,
      detail: `${c.hazard_status === 'confirmed' ? 'Mesh-confirmed' : 'Mesh-tracked'} hazard ${c.hazard_id}. Advice: ${c.advice.text}.`,
      severity: c.severity,
      source: 'Mesh network',
      conflict: c,
      hazard: airspace.hazards.find(h => h.id === c.hazard_id),
    }))
  }, [airspace, pushAlert])

  /** Marks one alert dismissed. */
  const dismissAlert = useCallback((id) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a)), [])

  return { alerts, setAlerts, dismissAlert, simSigmets }
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────
/** The Command Center: header controls, briefing, alerts, stats, layer toggles, map and tables. */
export default function CommandCenter() {
  const { data, loading } = usePolling(useCallback(() => api.mapLayers(), []), 15000)
  const { data: summary } = usePolling(useCallback(() => api.dashboardSummary(), []), 30000)
  const { data: airspace } = usePolling(useCallback(() => api.meshAirspace(), []), 5000)
  // ── Operational alerts: every alert is shown, announced, and optionally chimed ──
  const [prefs, setPref] = useA11yPrefs()
  const reducedMotion = usePrefersReducedMotion()
  const { alerts, setAlerts, dismissAlert, simSigmets } = useOperationalAlerts(airspace, prefs)

  // Alert details dialog and "Show on map".
  const [openAlertId, setOpenAlertId] = useState(null)
  const openAlert = alerts.find(a => a.id === openAlertId) || null
  const [mapFocus, setMapFocus] = useState(null)
  /** Closes the alert dialog, centres the map on `p` and scrolls the map into view. */
  const locateOnMap = useCallback((p) => {
    setOpenAlertId(null)
    setMapFocus({ lat: p.lat, lon: p.lon, n: Date.now() })
    requestAnimationFrame(() => document.querySelector('.leaflet-container')
      ?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' }))
  }, [reducedMotion])

  // State for layer toggles
  const [showMesh, setShowMesh] = useState(true)
  const [showRadar, setShowRadar] = useState(false)
  const [showWind, setShowWind] = useState(false)
  const [showAltitude, setShowAltitude] = useState(true)
  const [showTrails, setShowTrails] = useState(true)
  const [showHurricanes, setShowHurricanes] = useState(true)
  const [showSigmets, setShowSigmets] = useState(true)

  // Communication links between mesh stations, filtered from a panel on the map.
  // Shared with the Mesh Network map (and other tabs).
  const [commsFilter, setCommsFilter] = useCommsFilter()
  const commsOn = commsFilter.vhf || commsFilter.cellular || commsFilter.satellite
  const { data: meshStatus } = usePolling(
    useCallback(() => (commsOn ? api.meshStatus() : Promise.resolve(null)), [commsOn]), 5000)

  const flights = data?.flights || []
  const stations = data?.stations || []
  const firPolygon = data?.fir_polygon || []
  const apiSigmets = data?.sigmets || []
  const sigmets = [...apiSigmets, ...simSigmets.map(s => ({
    hazard: s.hazard_type || 'TS',
    hazard_name: s.hazard_name || s.hazard_type || 'SIGMET',
    severity: s.severity || 'moderate',
    raw_text: s.raw_text || '',
    valid_from: s.valid_from || '',
    valid_to: s.valid_to || '',
    area: s.area || '',
    fl_base: s.fl_base || 0,
    fl_top: s.fl_top || 450,
    source: 'simulation',
    description: s.description || '',
  }))]
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

  // Weather briefing: transcript always shown; read-aloud optional
  const [briefingOpen, setBriefingOpen] = useState(false)
  const briefingLines = useMemo(() => buildBriefing(summary, flights, stations), [summary, flights, stations])

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
          <button className="btn btn-sm" onClick={() => setBriefingOpen(o => !o)}
            aria-expanded={briefingOpen} aria-controls="briefing-panel"
            style={{background: briefingOpen ? 'var(--accent-strong)' : 'var(--bg-card)', color: briefingOpen ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border)'}}>
            <span aria-hidden="true">📋</span> Briefing
          </button>
          <button className="btn btn-sm" onClick={() => setWallboard(!wallboard)} aria-pressed={wallboard}
            title="Kiosk mode: hide statistics and enlarge the map for a wall display"
            style={{background: wallboard ? 'var(--accent-strong)' : 'var(--bg-card)', color: wallboard ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border)'}}>
            <span aria-hidden="true">🖥</span> Kiosk
          </button>
          <LiveBadge />
        </div>
      </div>

      <div id="briefing-panel">
        <BriefingPanel lines={briefingLines} open={briefingOpen} onClose={() => setBriefingOpen(false)}
          autoSpeak rate={prefs.speechRate} onRate={(r) => setPref('speechRate', r)} />
      </div>

      <AlertCenter alerts={alerts} prefs={prefs} setPref={setPref}
        onDismiss={dismissAlert}
        onDismissAll={() => setAlerts(prev => prev.map(a => ({ ...a, dismissed: true })))}
        onOpen={(a) => setOpenAlertId(a.id)} />
      <AlertDetails alert={openAlert} airspace={airspace} onClose={() => setOpenAlertId(null)}
        onDismiss={dismissAlert} onLocate={locateOnMap} />

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
      <div className="layer-toggles" role="group" aria-label="Map layers">
        {[
          ['Mesh hazards', showMesh, setShowMesh],
          ['Radar', showRadar, setShowRadar],
          ['Wind', showWind, setShowWind],
          ['Trails', showTrails, setShowTrails],
          ['Cyclones', showHurricanes, setShowHurricanes],
          ['SIGMETs', showSigmets, setShowSigmets],
          ['Altitude', showAltitude, setShowAltitude],
          ['Replay', timelapse.active, timelapse.setActive],
        ].map(([label, checked, set]) => (
          <label key={label}><input type="checkbox" checked={checked} onChange={() => set(!checked)} /> {label}</label>
        ))}
      </div>

      {/* Timelapse bar */}
      <TimelapseBar snapshots={timelapse.snapshots} active={timelapse.active}
        onToggle={() => timelapse.setActive(!timelapse.active)}
        currentIdx={timelapse.idx} onSeek={timelapse.setIdx} />

      {/* Map + Altitude Panel */}
      <div className="cc-map-row">
        <div className="card" style={{padding: 0, overflow: 'hidden', flex: 1}}>
          <div className="map-container" style={wallboard ? {height: 'calc(100vh - 80px)'} : {}}
            role="region" aria-label="Operational map of the Bahamas FIR" aria-describedby="map-alt-note">
            <p id="map-alt-note" className="sr-only">
              Station and cyclone markers can be reached with Tab and opened with Enter.
              All map content, including aircraft, is also available in the "Map data as tables" section below the map.
            </p>
            {loading && !data ? (
              <div className="loading-spinner"><div className="spinner" /></div>
            ) : (
              <MapContainer center={[24.5, -76.5]} zoom={7} style={{height: '100%', width: '100%'}}
                zoomControl={true} attributionControl={false}
                minZoom={5} maxZoom={18} scrollWheelZoom={true} dragging={true}
                zoomAnimation={!reducedMotion} fadeAnimation={!reducedMotion} markerZoomAnimation={!reducedMotion}>
                <ResetViewControl center={[24.5, -76.5]} zoom={7} />
                <CommsFilterControl status={meshStatus} filter={commsFilter} onChange={setCommsFilter} />
                <CommsLinksLayer status={meshStatus} filter={commsFilter} />
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
                <WindCanvas visible={showWind} reducedMotion={reducedMotion} />
                <MapA11y />
                <MapFocus focus={mapFocus} reducedMotion={reducedMotion} />

                {/* FIR boundary */}
                {firLatLngs.length > 0 && (
                  <Polygon positions={firLatLngs}
                    pathOptions={{color: '#3b82f6', weight: 2, fillOpacity: 0.05, dashArray: '8 4'}} />
                )}

                {/* Mesh hazards and predicted conflicts */}
                {showMesh && <MeshHazardLayers airspace={airspace} />}

                {/* 9. SIGMET overlays */}
                {showSigmets && <SigmetOverlays sigmets={sigmets} />}

                {/* 7. Hurricane tracks */}
                {showHurricanes && hurricanes.map(h => (
                  <span key={h.id}>
                    <Marker position={[h.lat, h.lon]} icon={hurricaneIcon}
                      title={`Tropical cyclone ${h.name}, ${h.classification}, ${h.wind_mph} mph`}>
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
                    icon={stationIcon(s.flight_category, s.source)}
                    title={`${s.icao} ${s.name}: ${s.flight_category && s.flight_category !== 'N/A' ? s.flight_category : 'flight category unavailable'}${s.source === 'model' ? ' (model estimate, not observed)' : s.source === 'metar' ? ' (observed)' : ''}`}>
                    <Popup><StationPopup s={s} /></Popup>
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
                  // Aircraft move every few seconds and overlap, so they are not Tab stops;
                  // the aircraft table below the map is the keyboard/screen-reader equivalent.
                  <Marker key={f.icao24} position={[f.lat, f.lon]}
                    icon={aircraftIcon(f.track)} keyboard={false}
                    title={`${f.callsign || f.icao24}, ${f.altitude ? feet(f.altitude).toLocaleString() + ' ft' : 'on ground'}`}>
                    <Popup><AircraftPopup f={f} /></Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
            <MapLegend visible={true} />
          </div>
        </div>

        {/* 6. Altitude slice panel (sits beside the map) */}
        {showAltitude && !wallboard && (
          <div style={{width: 220, flexShrink: 0}}>
            <AltitudePanel flights={displayFlights} visible={showAltitude} />
          </div>
        )}
      </div>

      {!wallboard && <MeshTrafficPanel airspace={airspace} />}

      {!wallboard && <SituationTables stations={stations} flights={displayFlights} sigmets={sigmets} hurricanes={hurricanes}
        links={commsOn ? visibleLinks(meshStatus?.links, commsFilter) : []} />}
    </div>
  )
}
