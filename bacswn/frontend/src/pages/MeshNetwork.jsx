import { useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const RADAR_D = 'M16 2 L16 10 M8 10 L24 10 M10 10 Q16 4 22 10 M6 12 L12 28 L20 28 L26 12 M4 28 L28 28'

const nodeIcon = (status, hubConn) => {
  const c = status === 'healthy' ? '#10b981' : status === 'caution' ? '#f59e0b' : status === 'degraded' ? '#ef4444' : '#374151'
  const r = hubConn ? '#3b82f6' : '#ef4444'
  return L.divIcon({
    className: 'station-marker',
    html: '<div style="filter:drop-shadow(0 0 6px ' + c + ')">'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="36" height="36">'
      + '<path fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="' + RADAR_D + '"/>'
      + '<circle cx="16" cy="6" r="3" fill="' + c + '"/>'
      + '<path fill="none" stroke="' + c + '" stroke-width="1.5" d="M9 3 Q16 -2 23 3" opacity="0.6"/>'
      + '<circle cx="28" cy="4" r="4" fill="' + r + '" stroke="white" stroke-width="1"/>'
      + '</svg></div>',
    iconSize: [36, 36], iconAnchor: [18, 36],
  })
}

const MSG_COLORS = {
  OBSERVATION: '#3b82f6', INFERENCE: '#8b5cf6', HEARTBEAT: '#64748b',
  ALERT: '#ef4444', VOTE: '#f59e0b', ROUTE: '#06b6d4',
}

export default function MeshNetwork() {
  const { data, loading } = usePolling(useCallback(() => api.meshStatus(), []), 5000)
  const [showLinks, setShowLinks] = useState(true)
  const [commFilters, setCommFilters] = useState({ vhf: true, cellular: true, satellite: true, hf: true })

  const COMM_COLORS = { vhf: '#10b981', cellular: '#3b82f6', satellite: '#a855f7', hf: '#f59e0b' }
  const COMM_LABELS = { vhf: 'VHF Radio', cellular: 'Cellular', satellite: 'Satellite', hf: 'HF Radio' }
  const COMM_DASH = { vhf: null, cellular: '10 5', satellite: '3 3', hf: '16 8' }
  const [consensusResult, setConsensusResult] = useState(null)
  const [triggering, setTriggering] = useState(false)

  const d = data || {}
  const nodes = d.nodes || []
  const topology = d.topology || {}
  const messages = d.messages || []
  const consensus = d.consensus_events || []
  const propagation = d.propagation_forecasts || []

  // Build deduplicated links
  const links = useMemo(() => {
    if (!nodes.length) return []
    const seen = new Set()
    const result = []
    for (const [src, peers] of Object.entries(topology)) {
      const sn = nodes.find(n => n.station === src)
      if (!sn) continue
      for (const peer of (peers || [])) {
        const key = [src, peer.station].sort().join('-')
        if (seen.has(key)) continue
        seen.add(key)
        const dn = nodes.find(n => n.station === peer.station)
        if (!dn) continue
        result.push({ key, from: [sn.lat, sn.lon], to: [dn.lat, dn.lon], quality: peer.signal_quality || 50, link_type: peer.link_type || 'vhf', distance: peer.distance_nm || 0 })
      }
    }
    return result
  }, [topology, nodes])

  const handleConsensus = async () => {
    setTriggering(true)
    try {
      const r = await api.meshConsensus('weather_alert')
      setConsensusResult(r)
    } catch (e) { setConsensusResult(null) }
    setTriggering(false)
  }

  if (loading && !data) return <div className="loading-spinner"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Distributed Mesh Network</h2>
          <p className="subtitle">Autonomous station intelligence and peer-to-peer topology</p>
        </div>
        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <span style={{fontSize: 12, color: 'var(--text-muted)'}}>{String(d.network_health_pct || 0)}% healthy</span>
          <div className="live-badge"><div className="live-dot" /> MESH</div>
        </div>
      </div>

      <div className="card-grid" style={{marginBottom: 16}}>
        <div className="stat-card">
          <span className="stat-label">Active Nodes</span>
          <span className="stat-value success">{String(d.healthy_nodes || 0)}</span>
          <span className="stat-detail">{String(d.total_nodes || 0)} total, {String(d.degraded_nodes || 0)} degraded</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Mesh Links</span>
          <span className="stat-value accent">{String(d.total_links || 0)}</span>
          <span className="stat-detail">Peer-to-peer connections</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Hub Connected</span>
          <span className="stat-value info">{String(d.hub_connected || 0)}</span>
          <span className="stat-detail">{String(d.autonomous || 0)} autonomous</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Consensus Events</span>
          <span className="stat-value warning">{String(consensus.length)}</span>
          <span className="stat-detail">{String(consensus.filter(c => c.alert_issued).length)} alerts issued</span>
        </div>
      </div>

      <div className="layer-toggles" style={{marginBottom: 10}}>
        <label><input type="checkbox" checked={showLinks} onChange={() => setShowLinks(!showLinks)} /> Mesh Links</label>
        {showLinks && (
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {Object.entries(COMM_LABELS).map(([type, label]) => (
              <label key={type} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                cursor: 'pointer', opacity: commFilters[type] ? 1 : 0.35,
                transition: 'opacity 0.2s',
              }}>
                <input type="checkbox" checked={commFilters[type]}
                  onChange={() => setCommFilters(f => ({ ...f, [type]: !f[type] }))}
                  style={{ accentColor: COMM_COLORS[type], width: 12, height: 12 }} />
                <span style={{ width: 20, height: 0, borderTop: type === 'vhf' ? '2px solid ' + COMM_COLORS[type] : type === 'cellular' ? '2px dashed ' + COMM_COLORS[type] : type === 'satellite' ? '2px dotted ' + COMM_COLORS[type] : '2px dashed ' + COMM_COLORS[type], display: 'inline-block' }} />
                <span style={{ color: COMM_COLORS[type] }}>{label}</span>
              </label>
            ))}
          </div>
        )}
        <button className="btn btn-sm btn-warning" onClick={handleConsensus} disabled={triggering} style={{marginLeft: 'auto'}}>
          {triggering ? 'Voting...' : 'Trigger Consensus Vote'}
        </button>
      </div>

      {consensusResult && (
        <div className="card" style={{marginBottom: 10, padding: 12}}>
          <div style={{fontWeight: 700, fontSize: 13, marginBottom: 4}}>{String(consensusResult.event || 'Vote')}</div>
          <div style={{fontSize: 12, color: consensusResult.alert_issued ? 'var(--success)' : 'var(--danger)'}}>
            {String(consensusResult.result || '')}
          </div>
          <div style={{display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap'}}>
            {Object.entries(consensusResult.votes || {}).map(([station, vote]) => (
              <span key={station} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: vote === 'AGREE' ? 'rgba(16,185,129,0.2)' : vote === 'DISAGREE' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)',
                color: vote === 'AGREE' ? '#10b981' : vote === 'DISAGREE' ? '#ef4444' : '#64748b',
              }}>{station}: {String(vote)}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{display: 'flex', gap: 12}}>
        <div className="card" style={{padding: 0, overflow: 'hidden', flex: 1}}>
          <div className="map-container">
            <MapContainer center={[24.5, -76.5]} zoom={7} style={{height: '100%', width: '100%'}}
              zoomControl={true} attributionControl={false} minZoom={5} maxZoom={18}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

              {showLinks && links.filter(link => commFilters[link.link_type]).map(link => (
                <Polyline key={link.key} positions={[link.from, link.to]}
                  pathOptions={{
                    color: COMM_COLORS[link.link_type] || '#94a3b8',
                    weight: link.link_type === 'satellite' ? 3 : link.link_type === 'hf' ? 2.5 : link.link_type === 'cellular' ? 2.5 : 2,
                    opacity: link.quality >= 80 ? 0.8 : link.quality >= 50 ? 0.5 : 0.3,
                    dashArray: COMM_DASH[link.link_type] || null,
                  }}
                >
                  <Popup>
                    <div style={{fontSize: 12}}>
                      <div style={{fontWeight: 700, color: COMM_COLORS[link.link_type]}}>{COMM_LABELS[link.link_type]}</div>
                      <div>Distance: {link.distance}nm</div>
                      <div>Signal: {link.quality}%</div>
                    </div>
                  </Popup>
                </Polyline>
              ))}

              {nodes.map(n => (
                <Marker key={n.station} position={[n.lat, n.lon]} icon={nodeIcon(n.status, n.hub_connected)}>
                  <Popup>
                    <div style={{color: '#000', minWidth: 240, fontSize: 12, lineHeight: 1.5}}>
                      <div style={{fontWeight: 700, fontSize: 14, borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 4}}>
                        {String(n.station)} - {String(n.name)}
                      </div>
                      <div><strong>Status:</strong> {String(n.status)}</div>
                      <div><strong>Hub:</strong> {n.hub_connected ? 'Connected' : 'Disconnected'}{n.autonomous_mode ? ' (AUTONOMOUS)' : ''}</div>
                      <div><strong>Peers:</strong> {String(n.peer_count)} nodes</div>
                      <div><strong>AI Confidence:</strong> {String(Math.round((n.local_ai?.confidence || 0) * 100))}%</div>
                      <div><strong>Pressure:</strong> {String(n.local_ai?.predictions?.pressure_trend || 'unknown')}</div>
                      <div><strong>Battery:</strong> {String(n.battery_pct)}%</div>
                      <div><strong>Messages:</strong> {String(n.messages_sent)} sent / {String(n.messages_received)} rcvd</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {propagation.map((pf, i) => {
                const src = nodes.find(n => n.station === pf.source)
                const tgt = nodes.find(n => n.station === pf.target)
                if (!src || !tgt) return null
                return <Polyline key={'prop-' + i} positions={[[src.lat, src.lon], [tgt.lat, tgt.lon]]}
                  pathOptions={{color: '#a855f7', weight: 3, opacity: 0.7, dashArray: '10 8'}} />
              })}
            
              {/* Communication Link Legend */}
              <div style={{
                position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
                background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(8px)',
                border: '1px solid var(--border, #334155)', borderRadius: 10,
                padding: '12px 16px', minWidth: 160,
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#f8fafc' }}>Communication Links</div>
                {[
                  ['#10b981', 'solid', 'VHF Radio', '< 60nm', 'Line of sight'],
                  ['#3b82f6', 'dashed', 'Cellular', '< 108nm', 'Cell tower relay'],
                  ['#a855f7', 'dotted', 'Satellite', '< 150nm', 'VSAT uplink'],
                  ['#f59e0b', 'dashed', 'HF Radio', '> 150nm', 'Long range fallback'],
                ].map(([color, style, label, range, desc]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <svg width="28" height="6" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="3" x2="28" y2="3"
                        stroke={color} strokeWidth="2.5"
                        strokeDasharray={style === 'dashed' ? '6 3' : style === 'dotted' ? '2 3' : 'none'} />
                    </svg>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: color }}>{label}</div>
                      <div style={{ fontSize: 9, color: '#64748b' }}>{range} • {desc}</div>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #334155', marginTop: 8, paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Signal Quality</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#10b981' }}>● Strong (&gt;80%)</span>
                    <span style={{ fontSize: 10, color: '#f59e0b' }}>● Fair (50-80%)</span>
                    <span style={{ fontSize: 10, color: '#ef4444' }}>● Weak (&lt;50%)</span>
                  </div>
                </div>
              </div>
            </MapContainer>
          </div>
        </div>

        <div style={{width: 280, flexShrink: 0, maxHeight: 650, overflowY: 'auto'}}>
          <div className="card" style={{marginBottom: 12}}>
            <h3 style={{fontSize: 13, marginBottom: 8}}>Live Message Feed</h3>
            <div style={{maxHeight: 250, overflowY: 'auto'}}>
              {messages.slice(-20).reverse().map((m, i) => (
                <div key={i} style={{fontSize: 10, padding: '4px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.4}}>
                  <span style={{
                    display: 'inline-block', padding: '0 4px', borderRadius: 2, fontSize: 9, fontWeight: 700, marginRight: 4,
                    background: (MSG_COLORS[m.type] || '#64748b') + '25', color: MSG_COLORS[m.type] || '#64748b',
                  }}>{String(m.type)}</span>
                  <span style={{color: 'var(--text-muted)'}}>{String(m.source)}-{String(m.destination)}</span>
                  <div style={{color: 'var(--text-secondary)', fontSize: 9, marginTop: 1}}>{String(m.detail)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{marginBottom: 12}}>
            <h3 style={{fontSize: 13, marginBottom: 8}}>Consensus History</h3>
            {consensus.map((c, i) => (
              <div key={i} style={{fontSize: 10, padding: '6px 0', borderBottom: '1px solid var(--border)'}}>
                <div style={{fontWeight: 700, fontSize: 11, color: c.alert_issued ? 'var(--success)' : 'var(--text-secondary)'}}>
                  {String(c.event)}
                </div>
                <div style={{display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap'}}>
                  {Object.entries(c.votes || {}).map(([s, v]) => (
                    <span key={s} style={{fontSize: 9, padding: '1px 4px', borderRadius: 3,
                      background: v === 'AGREE' ? 'rgba(16,185,129,0.2)' : v === 'DISAGREE' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)',
                      color: v === 'AGREE' ? '#10b981' : v === 'DISAGREE' ? '#ef4444' : '#64748b',
                    }}>{String(s)}:{String(v)}</span>
                  ))}
                </div>
                <div style={{fontSize: 9, color: 'var(--text-muted)', marginTop: 2}}>{String(c.result)}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{fontSize: 13, marginBottom: 8}}>Propagation Forecasts</h3>
            {propagation.map((pf, i) => (
              <div key={i} style={{fontSize: 10, padding: '6px 0', borderBottom: '1px solid var(--border)'}}>
                <div style={{fontWeight: 700, fontSize: 11, color: '#a855f7'}}>{String(pf.source)} to {String(pf.target)}</div>
                <div style={{color: 'var(--text-secondary)'}}>{String(pf.phenomenon)}</div>
                <div style={{color: 'var(--text-muted)'}}>ETA: {String(pf.eta_minutes)}min | {String(pf.speed_kt)}kt {String(pf.direction)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
