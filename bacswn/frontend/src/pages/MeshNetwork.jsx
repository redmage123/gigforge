import { useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

const nodeIcon = (status, hubConn) => {
  const c = status === 'healthy' ? '#10b981' : status === 'caution' ? '#f59e0b' : '#ef4444'
  const r = hubConn ? '#3b82f6' : '#ef4444'
  return L.divIcon({
    className: 'station-marker',
    html: '<div style="width:20px;height:20px;border-radius:50%;background:' + c + ';border:3px solid ' + r + ';box-shadow:0 0 8px ' + c + '"></div>',
    iconSize: [20, 20], iconAnchor: [10, 10],
  })
}

const MSG_COLORS = {
  OBSERVATION: '#3b82f6', INFERENCE: '#8b5cf6', HEARTBEAT: '#64748b',
  ALERT: '#ef4444', VOTE: '#f59e0b', ROUTE: '#06b6d4',
}

export default function MeshNetwork() {
  const { data, loading } = usePolling(useCallback(() => api.meshStatus(), []), 5000)
  const [showLinks, setShowLinks] = useState(true)
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
        result.push({ key, from: [sn.lat, sn.lon], to: [dn.lat, dn.lon], quality: peer.signal_quality || 50 })
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

              {showLinks && links.map(link => (
                <Polyline key={link.key} positions={[link.from, link.to]}
                  pathOptions={{color: link.quality >= 80 ? '#10b981' : link.quality >= 50 ? '#f59e0b' : '#ef4444', weight: 2, opacity: 0.6}} />
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
