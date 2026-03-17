import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'

const SCENARIO_ICONS = {
  hurricane: '\u{1F300}', storm: '\u{26C8}\uFE0F', fault: '\u{26A0}\uFE0F',
  network: '\u{1F310}', fog: '\u{1F32B}\uFE0F', wave: '\u{1F30A}',
}
const STATUS_COLORS = { healthy: '#10b981', caution: '#f59e0b', degraded: '#ef4444', offline: '#374151' }
const MSG_TYPE_COLORS = {
  OBSERVATION: '#3b82f6', INFERENCE: '#8b5cf6', ALERT: '#ef4444',
  VOTE: '#f59e0b', HEARTBEAT: '#64748b', SIGMET: '#f97316',
}
const ALERT_LEVEL_COLORS = { normal: '#10b981', advisory: '#3b82f6', watch: '#f59e0b', warning: '#ef4444', emergency: '#dc2626' }

// Hub location (Nassau)
const HUB = { lat: 25.039, lon: -77.466 }

// Radar tower SVG path
const RADAR_D = 'M16 2 L16 10 M8 10 L24 10 M10 10 Q16 4 22 10 M6 12 L12 28 L20 28 L26 12 M4 28 L28 28'

function nodeIcon(status, hubConnected, alertLevel) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.healthy
  const glow = alertLevel === 'emergency' ? '#dc2626' : alertLevel === 'warning' ? '#ef4444' : alertLevel === 'watch' ? '#f59e0b' : c
  const ring = hubConnected ? '#3b82f6' : '#ef4444'
  if (status === 'offline') {
    return L.divIcon({
      className: 'station-marker',
      html: '<div style="opacity:0.4"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="44" height="44">'
        + '<path fill="none" stroke="#374151" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="' + RADAR_D + '"/>'
        + '<circle cx="16" cy="6" r="3" fill="#374151"/>'
        + '<line x1="6" y1="4" x2="26" y2="24" stroke="#ef4444" stroke-width="3"/>'
        + '</svg></div>',
      iconSize: [44, 44], iconAnchor: [22, 44],
    })
  }
  // Satellite broadcast waves for autonomous/satellite mode
  const satWaves = (!hubConnected) ?
    '<circle cx="16" cy="3" r="6" fill="none" stroke="' + ring + '" stroke-width="1" opacity="0.5" class="sat-wave-1"/>'
    + '<circle cx="16" cy="3" r="10" fill="none" stroke="' + ring + '" stroke-width="0.8" opacity="0.3" class="sat-wave-2"/>'
    + '<circle cx="16" cy="3" r="14" fill="none" stroke="' + ring + '" stroke-width="0.6" opacity="0.15" class="sat-wave-3"/>'
    : ''
  return L.divIcon({
    className: 'station-marker',
    html: '<div style="filter:drop-shadow(0 0 8px ' + glow + ')">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -12 36 44" width="48" height="54">'
      + satWaves
      + '<path fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="' + RADAR_D + '"/>'
      + '<circle cx="16" cy="6" r="3" fill="' + c + '"/>'
      + '<path fill="none" stroke="' + c + '" stroke-width="1.5" d="M9 3 Q16 -2 23 3" opacity="0.6"/>'
      + '<path fill="none" stroke="' + c + '" stroke-width="1.5" d="M5 1 Q16 -5 27 1" opacity="0.35"/>'
      + '<circle cx="28" cy="4" r="4" fill="' + ring + '" stroke="white" stroke-width="1"/>'
      + '</svg></div>',
    iconSize: [48, 54], iconAnchor: [24, 54],
  })
}

function nodeLabel(station) {
  return L.divIcon({
    className: 'station-marker',
    html: '<div style="color:#fff;font-size:9px;font-weight:700;text-shadow:0 0 4px #000,0 0 4px #000;white-space:nowrap;pointer-events:none">' + station + '</div>',
    iconSize: [40, 14], iconAnchor: [20, -4],
  })
}

// Activity toast overlay on the map — shows transient dialogs near stations
function ActivityToasts({ alerts, messages, nodes }) {
  const map = useMap()
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const newToasts = []
    // Add alerts as toasts
    ;(alerts || []).forEach((a, i) => {
      const node = nodes.find(n => n.station === a.station)
      if (!node) return
      newToasts.push({
        id: 'alert-' + i,
        lat: node.lat + 0.15,
        lon: node.lon + 0.2,
        text: String(a.type) + ': ' + String(a.text).substring(0, 60),
        color: a.type === 'EMERGENCY' ? '#dc2626' : a.type === 'WARNING' ? '#ef4444' : '#f59e0b',
        bg: a.type === 'EMERGENCY' ? 'rgba(220,38,38,0.9)' : a.type === 'WARNING' ? 'rgba(239,68,68,0.85)' : 'rgba(245,158,11,0.85)',
      })
    })
    // Add key messages as toasts
    ;(messages || []).filter(m => m.type === 'ALERT' || m.type === 'INFERENCE' || m.type === 'SIGMET').forEach((m, i) => {
      const node = nodes.find(n => n.station === m.from)
      if (!node) return
      newToasts.push({
        id: 'msg-' + i,
        lat: node.lat - 0.15,
        lon: node.lon - 0.2,
        text: String(m.from) + ': ' + String(m.text).substring(0, 55),
        color: MSG_TYPE_COLORS[m.type] || '#3b82f6',
        bg: 'rgba(30,41,59,0.9)',
      })
    })
    setToasts(newToasts)
  }, [alerts, messages, nodes])

  return toasts.map(t => (
    <Marker key={t.id} position={[t.lat, t.lon]} interactive={false}
      icon={L.divIcon({
        className: 'station-marker',
        html: '<div class="sim-toast" style="background:' + t.bg + ';border:1px solid ' + t.color + ';color:#fff;font-size:9px;padding:3px 7px;border-radius:6px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.4)">'
          + t.text + '</div>',
        iconSize: [220, 24], iconAnchor: [110, 12],
      })} />
  ))
}

// The simulation map component — re-renders via key change per step
// Hurricane icon — pulsing cyclone
const hurricaneMapIcon = (category) => {
  const size = 36 + category * 4
  const color = category >= 4 ? '#dc2626' : category >= 3 ? '#f97316' : category >= 2 ? '#f59e0b' : '#3b82f6'
  return L.divIcon({
    className: 'station-marker',
    html: '<div class="hurricane-icon-pulse" style="filter:drop-shadow(0 0 12px ' + color + ')">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24">'
      + '<circle cx="12" cy="12" r="3" fill="' + color + '"/>'
      + '<path fill="none" stroke="' + color + '" stroke-width="1.5" d="M12 2 C6 6 6 18 12 22 M12 2 C18 6 18 18 12 22 M2 12 C6 6 18 6 22 12 M2 12 C6 18 18 18 22 12" opacity="0.7"/>'
      + '</svg></div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const CAT_COLORS = { 0: '#3b82f6', 1: '#3b82f6', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444', 5: '#dc2626' }

function SimMap({ nodes, messageLines, propLines, hubLines, alerts, messages, hurricane, step }) {
  return (
    <MapContainer key={'sim-' + step} center={[24.5, -76.5]} zoom={7} style={{ height: '100%', width: '100%' }}
      zoomControl={true} attributionControl={false} minZoom={5} maxZoom={18}>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

      {/* Hub connection lines — thin blue dashed when connected */}
      {hubLines.map(hl => (
        <Polyline key={hl.key} positions={[hl.from, hl.to]}
          pathOptions={{ color: hl.connected ? '#3b82f6' : '#ef4444', weight: 1, opacity: hl.connected ? 0.25 : 0.15, dashArray: '4 6' }} />
      ))}

      {/* Propagation forecast lines */}
      {propLines.map(pl => (
        <Polyline key={pl.key} positions={[pl.from, pl.to]}
          pathOptions={{ color: '#a855f7', weight: 3, opacity: 0.7, dashArray: '10 8' }} />
      ))}

      {/* Active message lines — colored by type */}
      {messageLines.map(ml => (
        <Polyline key={ml.key} positions={[ml.from, ml.to]}
          pathOptions={{ color: MSG_TYPE_COLORS[ml.type] || '#3b82f6', weight: 3, opacity: 0.85, dashArray: '8 4', className: 'msg-line-animate' }}>
          <Popup>
            <div style={{ color: '#000', fontSize: 12 }}>
              <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700, marginBottom: 4,
                background: (MSG_TYPE_COLORS[ml.type] || '#3b82f6') + '30', color: MSG_TYPE_COLORS[ml.type] || '#3b82f6' }}>{String(ml.type)}</span><br />
              <strong>{String(ml.from)}</strong> &rarr; <strong>{String(ml.to)}</strong><br />
              {String(ml.text)}
            </div>
          </Popup>
        </Polyline>
      ))}

      {/* Station nodes with radar tower icons */}
      {nodes.map(n => (
        <Marker key={n.station} position={[n.lat, n.lon]} icon={nodeIcon(n.status, n.hub_connected, n.alert_level)}>
          <Popup>
            <div style={{ color: '#000', minWidth: 240, fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, fontSize: 14, borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 4 }}>
                {String(n.station)} - {String(n.name)}
              </div>
              <div><strong>Status:</strong> <span style={{ color: STATUS_COLORS[n.status] || '#10b981', fontWeight: 700 }}>{String(n.status).toUpperCase()}</span></div>
              <div><strong>Hub:</strong> {n.hub_connected ? 'Connected' : 'DISCONNECTED'}{n.autonomous_mode ? ' — AUTONOMOUS MODE' : ''}</div>
              <div><strong>Alert Level:</strong> <span style={{ color: ALERT_LEVEL_COLORS[n.alert_level] || '#10b981', fontWeight: 700 }}>{String(n.alert_level || 'normal').toUpperCase()}</span></div>
              <div><strong>Pressure:</strong> {String(n.pressure_hpa)} hPa</div>
              <div><strong>Wind:</strong> {String(n.wind_kt)} kt</div>
              {n.visibility_sm != null && n.visibility_sm < 10 && <div><strong>Visibility:</strong> {String(n.visibility_sm)} SM</div>}
              {n.ceiling_ft != null && n.ceiling_ft < 25000 && <div><strong>Ceiling:</strong> {String(n.ceiling_ft)} ft</div>}
              {n.detection && <div style={{marginTop:4, padding:'4px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.3)'}}>
                <strong>Detection:</strong> <span style={{ color: '#f59e0b', fontWeight: 600 }}>{String(n.detection).replace(/_/g, ' ')}</span>
              </div>}
              {/* Show current activities from messages */}
              {(() => {
                const activities = (messages || []).filter(m => m.from === n.station || m.to === n.station)
                if (activities.length === 0) return null
                return <div style={{marginTop:6, borderTop:'1px solid #ddd', paddingTop:4}}>
                  <strong style={{fontSize:11}}>Current Activities:</strong>
                  {activities.map((a, i) => (
                    <div key={i} style={{fontSize:10, color:'#555', marginTop:2}}>
                      <span style={{color: MSG_TYPE_COLORS[a.type] || '#3b82f6', fontWeight:700, fontSize:9}}>{String(a.type)}</span>{' '}
                      {a.from === n.station ? 'Sending to ' + String(a.to) : 'Receiving from ' + String(a.from)}: {String(a.text).substring(0, 50)}
                    </div>
                  ))}
                </div>
              })()}
              {/* Show alerts at this station */}
              {(() => {
                const stationAlerts = (alerts || []).filter(a => a.station === n.station)
                if (stationAlerts.length === 0) return null
                return <div style={{marginTop:6, borderTop:'1px solid #ddd', paddingTop:4}}>
                  <strong style={{fontSize:11, color:'#dc2626'}}>Active Alerts:</strong>
                  {stationAlerts.map((a, i) => (
                    <div key={i} style={{fontSize:10, color:'#dc2626', marginTop:2, fontWeight:600}}>
                      {String(a.type)}: {String(a.text).substring(0, 60)}
                    </div>
                  ))}
                </div>
              })()}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Hurricane overlay */}
      {hurricane && hurricane.lat && (
        <Marker position={[hurricane.lat, hurricane.lon]} icon={hurricaneMapIcon(hurricane.category || 1)}>
          <Popup>
            <div style={{ color: '#000', minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: CAT_COLORS[hurricane.category] || '#ef4444' }}>{String(hurricane.name)}</div>
              <div style={{ fontWeight: 700 }}>Category {String(hurricane.category)}</div>
              <div><strong>Winds:</strong> {String(hurricane.wind_mph)} mph</div>
              <div><strong>Pressure:</strong> {String(hurricane.pressure_mb)} mb</div>
              <div><strong>Position:</strong> {String(hurricane.lat)}N, {String(Math.abs(hurricane.lon))}W</div>
            </div>
          </Popup>
        </Marker>
      )}
      {/* Hurricane forecast track line */}
      {hurricane && hurricane.forecast_track && hurricane.forecast_track.length > 1 && (
        <Polyline positions={hurricane.forecast_track}
          pathOptions={{ color: CAT_COLORS[hurricane.category] || '#ef4444', weight: 3, dashArray: '10 6', opacity: 0.8 }} />
      )}
      {/* Cone of uncertainty */}
      {hurricane && hurricane.cone_polygon && hurricane.cone_polygon.length > 2 && (
        <Polygon positions={hurricane.cone_polygon}
          pathOptions={{ color: CAT_COLORS[hurricane.category] || '#ef4444', weight: 1, fillColor: CAT_COLORS[hurricane.category] || '#ef4444', fillOpacity: 0.1, dashArray: '4 4' }} />
      )}

      {/* Station labels */}
      {nodes.map(n => (
        <Marker key={'label-' + n.station} position={[n.lat, n.lon]} icon={nodeLabel(n.station)} interactive={false} />
      ))}

      {/* Activity toast overlays */}
      <ActivityToasts alerts={alerts} messages={messages} nodes={nodes} />
    </MapContainer>
  )
}

export default function Simulations() {
  const [scenarios, setScenarios] = useState([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [activeScenario, setActiveScenario] = useState(null)
  const [simState, setSimState] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loadingStep, setLoadingStep] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    api.simulationScenarios().then(data => {
      setScenarios(data || [])
      setLoadingScenarios(false)
    }).catch(() => setLoadingScenarios(false))
  }, [])

  const fetchStep = useCallback(async (scenarioId, step) => {
    setLoadingStep(true)
    try {
      const data = await api.simulationRun(scenarioId, step)
      setSimState(data)
      setCurrentStep(step)
    } catch (e) { /* ignore */ }
    setLoadingStep(false)
  }, [])

  const startScenario = useCallback((scenario) => {
    setActiveScenario(scenario)
    setPlaying(false)
    setCurrentStep(0)
    fetchStep(scenario.id, 0)
  }, [fetchStep])

  useEffect(() => {
    if (playing && activeScenario && simState) {
      timerRef.current = setTimeout(() => {
        const nextStep = currentStep + 1
        if (nextStep < (simState.total_steps || 10)) {
          fetchStep(activeScenario.id, nextStep)
        } else {
          setPlaying(false)
        }
      }, 3000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, currentStep, activeScenario, simState, fetchStep])

  const handlePlay = () => {
    if (currentStep >= ((simState && simState.total_steps) || 10) - 1) {
      fetchStep(activeScenario.id, 0).then(() => setPlaying(true))
    } else {
      setPlaying(true)
    }
  }

  const handleReset = () => { setPlaying(false); setActiveScenario(null); setSimState(null); setCurrentStep(0) }

  if (loadingScenarios) return <div className="loading-spinner"><div className="spinner" /></div>

  if (!activeScenario) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h2>Mesh Network Simulations</h2>
            <p className="subtitle">Watch the distributed mesh network respond to real-world scenarios in real-time</p>
          </div>
        </div>
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {scenarios.map(s => (
            <div key={s.id} className="card" style={{ padding: 20, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onClick={() => startScenario(s)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 32 }}>{SCENARIO_ICONS[s.icon] || '\u{1F4E1}'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{String(s.name)}</div>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 600 }}>
                    {String(s.category || '').replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>{String(s.description)}</p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={e => { e.stopPropagation(); startScenario(s) }}>Run Simulation</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const nodes = (simState && simState.nodes) || []
  const messages = (simState && simState.active_messages) || []
  const consensus = (simState && simState.consensus_votes) || []
  const alerts = (simState && simState.alerts_issued) || []
  const propagation = (simState && simState.propagation_forecasts) || []
  const totalSteps = (simState && simState.total_steps) || 10
  const narration = (simState && simState.narration) || ''
  const elapsed = (simState && simState.elapsed_minutes) || 0

  // Message lines between stations
  const messageLines = messages.map((msg, i) => {
    const fromNode = nodes.find(n => n.station === msg.from)
    const toNode = nodes.find(n => n.station === msg.to)
    if (!fromNode || !toNode) return null
    return { key: 'msg-' + i, from: [fromNode.lat, fromNode.lon], to: [toNode.lat, toNode.lon], type: msg.type, text: msg.text, fromStation: msg.from, toStation: msg.to }
  }).filter(Boolean)

  // Propagation forecast lines
  const propLines = propagation.map((pf, i) => {
    const fromNode = nodes.find(n => n.station === pf.from)
    const toNode = nodes.find(n => n.station === pf.to)
    if (!fromNode || !toNode) return null
    return { key: 'prop-' + i, from: [fromNode.lat, fromNode.lon], to: [toNode.lat, toNode.lon] }
  }).filter(Boolean)

  // Hub connection lines — from each station to Nassau hub
  const hubLines = nodes.map(n => ({
    key: 'hub-' + n.station,
    from: [n.lat, n.lon],
    to: [HUB.lat, HUB.lon],
    connected: n.hub_connected,
  })).filter(n => n.key !== 'hub-MYNN') // don't draw line from hub to itself

  const progressPct = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{String(activeScenario.name)}</h2>
          <p className="subtitle">Step {String(currentStep + 1)} of {String(totalSteps)} — {String(elapsed)} min elapsed</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {playing && <div className="live-badge"><div className="live-dot" /> RUNNING</div>}
          <button className="btn btn-sm" onClick={handleReset} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>Back to Scenarios</button>
        </div>
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-sm" onClick={() => { setPlaying(false); if (currentStep > 0) fetchStep(activeScenario.id, currentStep - 1) }}
            disabled={currentStep <= 0 || loadingStep} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 16, padding: '4px 10px' }}>&#9664;&#9664;</button>
          {playing ? (
            <button className="btn btn-sm btn-warning" onClick={() => setPlaying(false)} style={{ fontSize: 16, padding: '4px 12px' }}>&#9646;&#9646;</button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={handlePlay} disabled={loadingStep} style={{ fontSize: 16, padding: '4px 12px' }}>&#9654;</button>
          )}
          <button className="btn btn-sm" onClick={() => { setPlaying(false); if (currentStep < totalSteps - 1) fetchStep(activeScenario.id, currentStep + 1) }}
            disabled={currentStep >= totalSteps - 1 || loadingStep} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 16, padding: '4px 10px' }}>&#9654;&#9654;</button>
          <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: progressPct + '%', height: '100%', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{String(currentStep + 1)}/{String(totalSteps)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 44px' }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} onClick={() => { setPlaying(false); fetchStep(activeScenario.id, i) }}
              style={{ width: 10, height: 10, borderRadius: '50%', cursor: 'pointer', background: i <= currentStep ? '#3b82f6' : 'var(--border)', border: i === currentStep ? '2px solid #8b5cf6' : '2px solid transparent', transition: 'all 0.2s' }}
              title={'Step ' + (i + 1)} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
          <div className="map-container">
            <SimMap nodes={nodes} messageLines={messageLines} propLines={propLines} hubLines={hubLines} alerts={alerts} messages={messages} hurricane={simState?.hurricane || null} step={currentStep} />
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, maxHeight: 700, overflowY: 'auto' }}>
          <div className="card" style={{ marginBottom: 12, padding: 16, borderLeft: '4px solid #3b82f6' }}>
            <h3 style={{ fontSize: 13, marginBottom: 8, color: '#3b82f6' }}>Narration</h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{String(narration)}</p>
          </div>

          {alerts.length > 0 && (
            <div className="card" style={{ marginBottom: 12, padding: 12 }}>
              <h3 style={{ fontSize: 13, marginBottom: 8, color: '#ef4444' }}>Active Alerts</h3>
              {alerts.map((a, i) => (
                <div key={i} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 6, background: a.type === 'EMERGENCY' ? 'rgba(220,38,38,0.15)' : 'rgba(239,68,68,0.1)', border: '1px solid rgba(220,38,38,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: '#fff', background: a.type === 'EMERGENCY' ? '#dc2626' : '#ef4444' }}>{String(a.type)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{String(a.station)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{String(a.text)}</div>
                </div>
              ))}
            </div>
          )}

          {consensus.length > 0 && (
            <div className="card" style={{ marginBottom: 12, padding: 12 }}>
              <h3 style={{ fontSize: 13, marginBottom: 8, color: '#f59e0b' }}>Consensus Votes</h3>
              {consensus.map((c, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{String(c.event)}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                    {Object.entries(c.votes || {}).map(([s, v]) => (
                      <span key={s} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: v === 'AGREE' ? 'rgba(16,185,129,0.2)' : v === 'DISAGREE' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)', color: v === 'AGREE' ? '#10b981' : v === 'DISAGREE' ? '#ef4444' : '#64748b' }}>
                        {String(s)}: {String(v)}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: c.result === 'REACHED' ? '#10b981' : '#ef4444' }}>
                    {c.result === 'REACHED' ? 'CONSENSUS REACHED' : 'CONSENSUS NOT REACHED'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="card" style={{ marginBottom: 12, padding: 12 }}>
              <h3 style={{ fontSize: 13, marginBottom: 8, color: '#8b5cf6' }}>Station Communications</h3>
              {messages.map((m, i) => (
                <div key={i} style={{ fontSize: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <span style={{ display: 'inline-block', padding: '0 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: (MSG_TYPE_COLORS[m.type] || '#64748b') + '25', color: MSG_TYPE_COLORS[m.type] || '#64748b' }}>{String(m.type)}</span>
                    <span style={{ fontWeight: 600 }}>{String(m.from)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                    <span style={{ fontWeight: 600 }}>{String(m.to)}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{String(m.text)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
