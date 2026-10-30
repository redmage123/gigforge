import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Circle, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import PrecogChamber, { HAZARD_COLORS } from '../components/mesh/PrecogChamber'
import MeshLogs from '../components/mesh/MeshLogs'
import '../components/mesh/mesh.css'

const LINK_COLORS = { vhf: '#10b981', cellular: '#3b82f6', satellite: '#a855f7' }
const MSG_COLORS = { ALERT: '#ef4444', HAZARD: '#f59e0b', VOTE: '#facc15', PROPAGATION: '#c084fc', MAINT: '#fb923c', HEARTBEAT: '#94a3b8' }
const SCENARIOS = [
  ['squall_line', 'Squall line from Florida', 'Three squall cells sweep SE across Grand Bahama, Abaco and Nassau'],
  ['rogue_precog', 'Rogue model @ Nassau', 'Corrupt the LEXIS model at the hub — watch it get outvoted, then quarantined'],
  ['sensor_fault', 'Stuck sensor @ Exuma', 'Visibility sensor sticks at ½ SM — fools two local models, peers reject it'],
  ['partition', 'Partition the south', 'Cut Inagua, Mayaguana & Ragged Island off — alerts queue (store-and-forward)'],
]

const dbzColor = (c) => c.kind === 'fog' ? '#cbd5e1'
  : c.intensity >= 52 ? '#d946ef' : c.intensity >= 45 ? '#ef4444' : c.intensity >= 38 ? '#f59e0b' : '#22c55e'

function nodeIcon(n, selected) {
  const color = n.alive ? HAZARD_COLORS[n.verdict.call] : '#475569'
  const alarm = n.alive && n.verdict.call !== 'CLEAR'
  const flag = n.status === 'degraded' ? '!' : n.verdict.split ? '?' : ''
  const cls = ['mesh-node', n.is_hub && 'hub', !n.alive && 'offline', alarm && 'alarm', selected && 'selected'].filter(Boolean).join(' ')
  return L.divIcon({
    className: '', iconSize: [30, 30], iconAnchor: [15, 15],
    html: `<div class="${cls}" style="color:${color}"><div class="ring"></div><div class="core"></div>`
      + (flag ? `<div class="flag">${flag}</div>` : '')
      + `<div class="tag">${n.station}<em style="color:${color}">${n.alive ? n.verdict.call : 'OFFLINE'}</em></div></div>`,
  })
}

/** Animated dots travelling hop-by-hop along recent message paths. */
function MessagePulses({ messages, coords, tick }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    // Anchor to the first frame's timestamp: rAF times can precede performance.now(),
    // which would make the phase negative.
    let raf, start = null
    const loop = (t) => {
      start ??= t
      setPhase(((t - start) % 1600) / 1600)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const recent = messages.filter(m => tick - m.tick <= 1 && m.path.length > 1).slice(0, 18)
  return recent.map(m => {
    const pts = m.path.map(s => coords[s]).filter(Boolean)
    if (pts.length < 2) return null
    const f = phase * (pts.length - 1)
    const i = Math.min(Math.floor(f), pts.length - 2)
    const r = f - i
    const pos = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r]
    const color = MSG_COLORS[m.type] || '#fff'
    return <CircleMarker key={m.id} center={pos} radius={m.type === 'ALERT' ? 6 : 4}
      pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 2, opacity: 0.6 }} interactive={false} />
  })
}

function ClickToSpawn({ mode, onSpawn }) {
  useMapEvents({ click: (e) => { if (mode) onSpawn(e.latlng) } })
  return null
}

export default function MeshNetwork() {
  const { data, refresh } = usePolling(useCallback(() => api.meshStatus(), []), 1500)
  const [selected, setSelected] = useState('MYNN')
  const [spawnMode, setSpawnMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const d = data || {}
  const nodes = d.nodes || []
  const coords = useMemo(() => Object.fromEntries(nodes.map(n => [n.station, [n.lat, n.lon]])), [nodes])
  const node = nodes.find(n => n.station === selected)
  const routeLine = node?.route_to_hub?.path?.map(s => coords[s]).filter(Boolean)
  const c = d.counters || {}
  const quarantined = nodes.reduce((a, n) => a + n.precogs.filter(p => p.quarantined).length, 0)
  const openReports = (d.minority_reports || []).filter(r => r.status === 'OPEN').length

  const run = async (fn, msg) => {
    setBusy(true)
    try {
      await fn()
      if (msg) {
        setToast(msg)
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 5000)
      }
      await refresh()
    } catch (e) {
      setToast('⚠ ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="loading-spinner"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Distributed AI Mesh</h2>
          <p className="subtitle">
            15 autonomous stations · three independent AI models per station (2-of-3 consensus) · peer verification · self-healing routing
          </p>
        </div>
        <div className="live-badge"><div className="live-dot" /> LIVE SIMULATION</div>
      </div>

      <div className="mesh-kpis">
        <div className="mesh-kpi"><label>Stations online</label><b style={{ color: 'var(--success)' }}>{d.online_nodes}/{d.total_nodes}</b><small>{d.degraded_nodes} degraded / caution</small></div>
        <div className="mesh-kpi"><label>Hub reachable</label><b style={{ color: d.hub_reachable === d.online_nodes ? 'var(--info)' : 'var(--danger)' }}>{d.hub_reachable}</b><small>{d.links_up}/{d.total_links} links up</small></div>
        <div className="mesh-kpi"><label>Alerts to hub</label><b style={{ color: 'var(--danger)' }}>{c.alerts}</b><small>{c.store_forward} via store-and-forward</small></div>
        <div className="mesh-kpi"><label>Peer verification</label><b style={{ color: 'var(--warning)' }}>{c.confirmed}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}> / {c.rejected}</span></b><small>confirmed / rejected</small></div>
        <div className="mesh-kpi"><label>Minority reports</label><b style={{ color: 'var(--accent)' }}>{openReports}</b><small>{c.vindicated} vindicated · {c.dismissed} dismissed</small></div>
        <div className="mesh-kpi"><label>Models quarantined</label><b style={{ color: quarantined ? 'var(--danger)' : 'var(--text-primary)' }}>{quarantined}</b><small>{c.quarantines} total this session</small></div>
      </div>

      <div className="mesh-toolbar">
        <span className="label">Scenarios</span>
        {SCENARIOS.map(([id, label, hint]) => (
          <button key={id} className="mesh-chip" title={hint} disabled={busy}
            onClick={() => run(() => api.meshScenario(id), hint)}>{label}</button>
        ))}
        <button className="mesh-chip danger" disabled={busy} onClick={() => run(() => api.meshScenario('reset'), 'Simulation reset')}>Reset</button>
        <span className="sep" />
        <span className="label">Click map to spawn</span>
        {['squall', 'convective', 'fog'].map(k => (
          <button key={k} className={`mesh-chip ${spawnMode === k ? 'on' : ''}`} onClick={() => setSpawnMode(spawnMode === k ? null : k)}>{k}</button>
        ))}
        {toast && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{toast}</span>}
      </div>

      <div className="mesh-main">
        <div className={`mesh-map ${spawnMode ? 'spawning' : ''}`}>
          <MapContainer bounds={[[20.7, -79.8], [27.1, -72.8]]} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            <ClickToSpawn mode={spawnMode} onSpawn={(ll) => run(() => api.meshStorm({ kind: spawnMode, lat: ll.lat, lon: ll.lng }),
              `${spawnMode} cell spawned`)} />

            {(d.cells || []).map(cell => (
              <Fragment key={cell.id}>
                <Circle center={[cell.lat, cell.lon]} radius={cell.radius_nm * 1852 * 0.9}
                  pathOptions={{ color: dbzColor(cell), fillColor: dbzColor(cell), fillOpacity: cell.kind === 'fog' ? 0.28 : 0.22, weight: 1 }}>
                  <Tooltip>{cell.id} · {cell.kind} · {cell.kind === 'fog' ? `density ${cell.intensity}` : `${cell.intensity} dBZ`} · {cell.direction} {cell.speed_kt} kt</Tooltip>
                </Circle>
                <Circle center={[cell.lat, cell.lon]} radius={cell.radius_nm * 1852 * 0.35}
                  pathOptions={{ color: dbzColor(cell), fillColor: dbzColor(cell), fillOpacity: 0.35, weight: 0 }} interactive={false} />
                <Polyline positions={cell.track} pathOptions={{ color: dbzColor(cell), weight: 1.5, dashArray: '3 5', opacity: 0.8 }} interactive={false} />
              </Fragment>
            ))}

            {(d.links || []).map(l => coords[l.a] && coords[l.b] && (
              <Polyline key={l.a + l.b} positions={[coords[l.a], coords[l.b]]}
                pathOptions={{
                  color: l.up ? LINK_COLORS[l.type] : '#ef4444',
                  weight: l.up ? 1.5 + Math.min(4, l.traffic / 2) : 1.5,
                  opacity: l.up ? 0.55 : 0.7,
                  dashArray: !l.up ? '4 6' : l.type === 'satellite' ? '2 5' : l.type === 'cellular' ? '8 4' : null,
                }}>
                <Tooltip sticky>{l.a}–{l.b} · {l.type} · {l.distance_nm} nm · {l.latency_ms} ms · {l.up ? `${l.traffic} msgs/10 ticks` : 'DOWN'}</Tooltip>
              </Polyline>
            ))}

            {routeLine?.length > 1 && (
              <Polyline positions={routeLine} pathOptions={{ color: '#22d3ee', weight: 5, opacity: 0.85 }} interactive={false} />
            )}

            <MessagePulses messages={[...(d.messages || []), ...(d.heartbeats || [])]} coords={coords} tick={d.tick} />

            {nodes.map(n => (
              <Marker key={n.station} position={[n.lat, n.lon]} icon={nodeIcon(n, n.station === selected)}
                eventHandlers={{ click: () => setSelected(n.station) }} />
            ))}
          </MapContainer>

          <div className="mesh-clock">
            {d.sim_time?.slice(11, 16)}Z <small>sim · {d.sim_minutes_per_tick} min per second</small>
          </div>
          <div className="mesh-legend">
            {Object.entries(HAZARD_COLORS).map(([h, col]) => <span key={h}><i style={{ background: col }} />{h}</span>)}
            <span><s style={{ borderColor: LINK_COLORS.vhf }} />VHF</span>
            <span><s style={{ borderColor: LINK_COLORS.cellular, borderTopStyle: 'dashed' }} />Cellular</span>
            <span><s style={{ borderColor: LINK_COLORS.satellite, borderTopStyle: 'dotted' }} />Satellite</span>
            <span><s style={{ borderColor: '#22d3ee', borderTopWidth: 4 }} />Route to hub</span>
          </div>
        </div>

        <PrecogChamber node={node} hub={d.hub} busy={busy}
          onFault={(f) => run(() => api.meshFault(f), `${f.kind.replace('_', ' ')} → ${f.station}`)}
          onVerify={(s) => run(() => api.meshConsensus(s), `Verification requested from ${s}'s peers`)} />
      </div>

      <MeshLogs data={d} onSelect={setSelected} />
    </div>
  )
}
