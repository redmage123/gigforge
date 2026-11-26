/**
 * Flight Operations page.
 *
 * What: live air picture of the Bahamas FIR: an animated canvas of aircraft over a
 * satellite map, emergency-squawk alerts, category/country/altitude breakdowns, an
 * Active Flights table with "weather ahead" from the mesh, and a details dialog.
 * Why: gives forecasters and ATC liaison a single view of who is in the airspace, who
 * is in trouble, and who is about to fly into hazardous weather.
 * How: polls `api.liveFlights()` and `api.meshAirspace()` every 10 s, and
 * `api.flightStats()` and `api.mapLayers()` (FIR polygon) every 30 s. FlightCanvas draws
 * pointer-only aircraft that glide between updates (jump under reduced motion); the table
 * is the keyboard/screen-reader equivalent. Emergency squawks (7500/7600/7700) are
 * flagged locally as well as by the server.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { usePrefersReducedMotion } from '../hooks/useA11yPrefs'
import Dialog from '../components/a11y/Dialog'
import ChartTable, { chartTextColor, summarise } from '../components/a11y/ChartTable'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js'
import LiveBadge from '../components/LiveBadge'
import ResetViewControl from '../components/map/ResetViewControl'
import { drawPlane, PLANE_SIZE, PLANE_FILL } from '../components/map/plane'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, ChartTooltip, Legend)

// ─── Aircraft categories ──────────────────────────────────────────────
/** Display groups for OpenSky/ADS-B emitter categories, in legend order. */
const AIRCRAFT_GROUPS = [
  { key: 'commercial', label: 'Commercial', color: '#3b82f6' },
  { key: 'private', label: 'Private/GA', color: '#10b981' },
  { key: 'military', label: 'Military', color: '#ef4444' },
  { key: 'rotorcraft', label: 'Rotorcraft', color: '#f59e0b' },
  { key: 'unknown', label: 'Unknown', color: '#94a3b8' },
]
/** AIRCRAFT_GROUPS indexed by key. */
const GROUP = Object.fromEntries(AIRCRAFT_GROUPS.map(g => [g.key, g]))

/**
 * Display group for an ADS-B emitter category number.
 * @param {number} category 4-7 large/heavy, 2-3 light/GA, 8 rotorcraft, 9-10 military; anything else unknown
 * @returns {{key: string, label: string, color: string}}
 */
const aircraftGroup = (category) => {
  if (category >= 4 && category <= 7) return GROUP.commercial
  if (category === 2 || category === 3) return GROUP.private
  if (category === 9 || category === 10) return GROUP.military
  if (category === 8) return GROUP.rotorcraft
  return GROUP.unknown
}

/** Colour of an aircraft's display group (see aircraftGroup). */
const getCatColor = (category) => aircraftGroup(category).color

/**
 * Barometric altitude as an ICAO flight level, e.g. 10668 m -> "FL350".
 * @param {number} altitudeM barometric altitude in metres
 * @returns {string}
 */
const flightLevel = (altitudeM) => `FL${Math.round(altitudeM * 3.281 / 100).toString().padStart(3, '0')}`

/**
 * Speed in whole knots.
 * @param {number} ms speed in metres per second
 * @returns {number}
 */
const knots = (ms) => Math.round(ms * 1.944)

/** Callsign (trimmed) or, if none, the ICAO24 hex address. */
const flightName = (f) => f.callsign?.trim() || f.icao24

/**
 * Short "weather ahead" text for a mesh airspace conflict, e.g. "TSRA in 12 min".
 * @param {{hazard: string, inside: boolean, minutes_to_entry: number}} c
 * @returns {string}
 */
const aheadText = (c) => `${c.hazard} ${c.inside ? 'now' : `in ${c.minutes_to_entry} min`}`

/** Altitude-band chart buckets: [flightStats key, label]. */
const ALTITUDE_BANDS = [
  ['ground', 'Ground'], ['low', 'Low (<3km)'], ['medium', 'Medium (3-8km)'], ['high', 'High (8-12km)'], ['cruise', 'Cruise (>12km)'],
]

/** Transponder emergency codes. The server flags them too; this covers any source that doesn't. */
const EMERGENCY_SQUAWKS = {
  '7500': 'Unlawful interference (hijack)',
  '7600': 'Radio communication failure',
  '7700': 'General emergency',
}
/**
 * Emergency for a flight: the server's `emergency` field, else derived from its squawk.
 * @param {object} f flight
 * @returns {{code: string, meaning: string}|null}
 */
const emergencyOf = (f) => f?.emergency ||
  (EMERGENCY_SQUAWKS[String(f?.squawk || '').trim()] ? { code: String(f.squawk).trim(), meaning: EMERGENCY_SQUAWKS[String(f.squawk).trim()] } : null)
/** Ring/border colour for aircraft squawking an emergency. */
const EMERGENCY_RED = '#ef4444'

/** Approximate Bahamas FIR boundary [lat, lon], used until the server's polygon arrives. */
const BAHAMAS_FIR = [
  [28.0, -80.5], [28.0, -77.5], [27.0, -76.5], [26.0, -76.0],
  [24.5, -75.5], [22.5, -75.5], [21.0, -77.0], [21.0, -79.5],
  [23.5, -81.5], [25.5, -81.5], [28.0, -80.5],
]

// ─── Canvas: smooth aircraft rendering with interpolation ─────────────
/**
 * Leaflet child that overlays a canvas and draws every aircraft each animation frame:
 * category-coloured disc, the shared yellow plane glyph, a fading 5-point trail, a
 * pulsing red ring for emergencies, and the callsign on hover. Positions ease toward the
 * latest report (or jump under reduced motion). A click selects the nearest aircraft
 * within 22 px (or null). The canvas is aria-hidden; the flights table is the
 * accessible equivalent.
 * @param {object} props
 * @param {object[]} props.flights current flights (lat/lon normalised)
 * @param {function(object|null): void} props.onSelect called on click
 * @param {boolean} props.reducedMotion user prefers reduced motion
 */
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

    /** Matches the canvas size to the map's. */
    const resize = () => {
      const s = map.getSize()
      canvas.width = s.x
      canvas.height = s.y
    }
    resize()
    map.on('resize', resize)
    map.on('moveend', resize)
    map.on('zoomend', resize)

    /** Tracks the pointer for hover highlighting. */
    const onMouseMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    /** Selects the aircraft nearest the click (within 22 px), or clears the selection. */
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

    /** Per-frame fraction of the remaining distance an aircraft moves toward its reported position. */
    const LERP = 0.018

    /** Draws one frame and schedules the next. */
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

        const size = hover ? PLANE_SIZE + 6 : PLANE_SIZE
        // Same yellow plane as the Command Center; the category colour sits behind it as a disc.
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = color + '66'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = color
        ctx.stroke()
        if (s.emergency) {
          // Emergency squawk: a thick red ring that pulses unless reduced motion is on.
          const pulse = motionRef.current ? 0 : (Math.sin(Date.now() / 250) + 1) * 3
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, size * 0.75 + pulse, 0, Math.PI * 2)
          ctx.lineWidth = 3
          ctx.strokeStyle = EMERGENCY_RED
          ctx.stroke()
        }
        drawPlane(ctx, pt.x, pt.y, s.track || s.true_track || 0, PLANE_FILL, size, hover)

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
/** The Flight Operations page: emergencies, legend, map, charts, stats, flights table and details dialog. */
export default function FlightOps() {
  const { data: flightData, loading } = usePolling(useCallback(() => api.liveFlights(), []), 10000)
  const { data: statsData } = usePolling(useCallback(() => api.flightStats(), []), 30000)
  const { data: mapData } = usePolling(useCallback(() => api.mapLayers(), []), 30000)
  const [selected, setSelected] = useState(null)

  const flights = (flightData?.flights || []).map(f => ({
    ...f,
    lat: f.lat || f.latitude,
    lon: f.lon || f.longitude,
    emergency: emergencyOf(f),
  }))
  const emergencies = flights.filter(f => f.emergency)
  const firRaw = mapData?.fir_polygon || []
  const firPolygon = firRaw.length > 0
    ? firRaw.map(([lon, lat]) => [lat, lon])
    : BAHAMAS_FIR

  /** Stable selection callback for the canvas (selects a flight or clears with null). */
  const handleSelect = useCallback((f) => setSelected(f), [])
  // Mesh weather ahead of each aircraft (predicted hazard entries in the next 30 min).
  const { data: airspace } = usePolling(useCallback(() => api.meshAirspace(), []), 10000)
  const ahead = Object.fromEntries((airspace?.conflicts || []).map(c => [c.icao24, c]))
  const reducedMotion = usePrefersReducedMotion()
  const legendColor = chartTextColor()

  // Category breakdown
  const counts = Object.fromEntries(AIRCRAFT_GROUPS.map(g => [g.key, 0]))
  flights.forEach(f => { counts[aircraftGroup(f.category).key]++ })
  const countryLabels = Object.keys(statsData?.by_country || {}).slice(0, 8)
  const countryValues = Object.values(statsData?.by_country || {}).slice(0, 8)
  const altitudeLabels = ALTITUDE_BANDS.map(([, label]) => label)
  const altitudeValues = ALTITUDE_BANDS.map(([k]) => statsData?.altitude_bands?.[k] || 0)

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
          <LiveBadge />
        </div>
      </div>

      {/* Emergency squawks: announced once per change, listed until they clear */}
      <div role="alert">
        {emergencies.length > 0 && (
          <div className="card" style={{ border: `2px solid ${EMERGENCY_RED}`, background: 'rgba(239,68,68,0.12)', marginBottom: 12, padding: '10px 14px' }}>
            <strong style={{ color: 'var(--danger-text)' }}>
              Emergency squawk{emergencies.length > 1 ? 's' : ''} in the FIR ({emergencies.length})
            </strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {emergencies.map(f => (
                <li key={f.icao24}>
                  <button type="button" className="link-btn" style={{ fontFamily: 'monospace', fontWeight: 700 }}
                    onClick={() => setSelected(f)}>{flightName(f)}</button>
                  {' '}squawking <b>{f.emergency.code}</b>: {f.emergency.meaning}
                  {f.baro_altitude ? `, ${flightLevel(f.baro_altitude)}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }} role="list" aria-label="Aircraft by category">
        {AIRCRAFT_GROUPS.map(({ key, color, label }) => (
          <div key={label} role="listitem" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: color + '15', border: '1px solid ' + color + '40',
            borderRadius: 8, padding: '4px 12px', fontSize: 12,
          }}>
            <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{counts[key]}</span>
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
                <ResetViewControl center={[24.5, -76.5]} zoom={7} />
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
          <div className="card" style={{ marginBottom: 12 }} id="chart-aircraft-by-country">
            <div className="card-header"><h3>By Country</h3></div>
            <div style={{ height: 180, padding: 8 }}>
              <Doughnut aria-label={`Doughnut chart, aircraft by country of origin: ${summarise(countryLabels, countryValues)}`} data={{
                labels: countryLabels,
                datasets: [{ data: countryValues,
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#94a3b8'],
                  borderWidth: 0 }]
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: legendColor, font: { size: 11 } } } } }} />
            </div>
            <div style={{ padding: '0 8px 8px' }}>
              <ChartTable caption="Aircraft by country of origin" labels={countryLabels}
                series={[{ name: 'Aircraft', values: countryValues }]}
                shareId="chart-aircraft-by-country" filename="aircraft-by-country" labelHeader="Country" />
            </div>
          </div>
          <div className="card" style={{ marginBottom: 12 }} id="chart-altitude-bands">
            <div className="card-header"><h3>Altitude Distribution</h3></div>
            <div style={{ height: 180, padding: 8 }}>
              <Bar aria-label={`Bar chart, aircraft by altitude band: ${summarise(altitudeLabels, altitudeValues)}`} data={{
                labels: altitudeLabels,
                datasets: [{ label: 'Flights', data: altitudeValues,
                  backgroundColor: ['#94a3b8', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                  borderRadius: 6 }]
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: legendColor, font: { size: 10 } } }, y: { ticks: { color: legendColor }, grid: { color: 'rgba(148,163,184,0.2)' } } } }} />
            </div>
            <div style={{ padding: '0 8px 8px' }}>
              <ChartTable caption="Aircraft by altitude band"
                labels={altitudeLabels}
                series={[{ name: 'Aircraft', values: altitudeValues }]}
                shareId="chart-altitude-bands" filename="aircraft-by-altitude" labelHeader="Altitude band" />
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
                const { color, label: groupLabel } = aircraftGroup(f.category)
                const isSelected = selected?.icao24 === f.icao24
                return (
                  <tr key={f.icao24} onClick={() => setSelected(f)} style={{
                    cursor: 'pointer',
                    background: f.emergency ? 'rgba(239,68,68,0.14)' : isSelected ? color + '15' : undefined,
                    boxShadow: f.emergency ? `inset 4px 0 0 ${EMERGENCY_RED}` : undefined,
                  }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{groupLabel}</span>
                      </div>
                    </td>
                    <th scope="row" style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      <button type="button" className="link-btn" style={{ fontFamily: 'inherit' }}
                        aria-label={`${flightName(f)}, show details`}
                        onClick={e => { e.stopPropagation(); setSelected(f) }}>{flightName(f)}</button>
                      {isSelected && <span className="sr-only"> (selected)</span>}
                    </th>
                    <td>{f.origin_country}</td>
                    <td>{f.baro_altitude ? flightLevel(f.baro_altitude) : 'GND'}</td>
                    <td>{f.velocity ? `${knots(f.velocity)}kt` : '—'}</td>
                    <td>{f.true_track ? `${Math.round(f.true_track)}°` : f.track ? `${Math.round(f.track)}°` : '—'}</td>
                    <td>
                      {f.emergency ? (
                        <span className="cat-badge cat-IFR" title={f.emergency.meaning}
                          style={{ fontWeight: 800, border: `1px solid ${EMERGENCY_RED}` }}>
                          {f.emergency.code} EMERGENCY<span className="sr-only">: {f.emergency.meaning}</span>
                        </span>
                      ) : (
                        <span className={`cat-badge ${f.on_ground ? 'cat-IFR' : 'cat-VFR'}`}>
                          {f.on_ground ? 'GND' : 'AIRBORNE'}
                        </span>
                      )}
                    </td>
                    <td>{ahead[f.icao24] ? (
                      <span style={{ color: ahead[f.icao24].severity === 'severe' ? 'var(--danger-text)' : 'var(--warning-text)', fontWeight: 600 }}>
                        {aheadText(ahead[f.icao24])}
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
        title={selected ? `${flightName(selected)}${selected.airline ? ` — ${selected.airline}` : ''}` : ''}>
        {selected && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px 20px', fontSize: 13, margin: 0 }}>
            {[
              ['Airline', selected.airline || '—'],
              ['Aircraft', selected.aircraft_type || '—'],
              ['Registration', selected.registration || '—'],
              ['Route', selected.route || '—'],
              ['Origin', selected.origin_country || '—'],
              ['ICAO24', selected.icao24],
              ['Altitude', selected.baro_altitude ? flightLevel(selected.baro_altitude) : 'GND'],
              ['Ground Speed', selected.velocity ? knots(selected.velocity) + ' kt' : '—'],
              ['Heading', (selected.track || selected.true_track) ? Math.round(selected.track || selected.true_track) + '°' : '—'],
              ['Vertical Speed', selected.vertical_rate ? (selected.vertical_rate > 0 ? '+' : '') + Math.round(selected.vertical_rate * 196.85) + ' fpm' : '—'],
              ['Squawk', selected.emergency
                ? <span style={{ color: 'var(--danger-text)' }}>{selected.emergency.code} — {selected.emergency.meaning}</span>
                : selected.squawk || '—'],
              ['Status', selected.emergency ? <span style={{ color: 'var(--danger-text)' }}>Emergency declared</span>
                : selected.on_ground ? 'On Ground' : 'Airborne'],
              ['Weather ahead', ahead[selected.icao24]
                ? `${aheadText(ahead[selected.icao24])} — ${ahead[selected.icao24].advice.text}`
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
