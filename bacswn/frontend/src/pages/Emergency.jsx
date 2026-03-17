import { useState, useCallback } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

export default function Emergency() {
  const { data: channelData } = usePolling(useCallback(() => api.channels(), []), 60000)
  const { data: logData, refresh: refreshLog } = usePolling(useCallback(() => api.dispatchLog(), []), 30000)

  const [alertForm, setAlertForm] = useState({
    title: 'SIGMET — Severe Thunderstorm Warning',
    description: 'Severe thunderstorm activity developing over northern Bahamas. All aircraft advised to avoid area north of MYNN FL200-FL400. Expected to intensify over next 3 hours.',
    severity: 'warning',
    incident_type: 'weather',
  })
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState(null)

  const channelSummary = channelData || {}
  const dispatchLog = logData?.messages || []

  const handleDispatch = async () => {
    setDispatching(true)
    try {
      const result = await api.dispatchAlert(alertForm)
      setDispatchResult(result)
      refreshLog()
    } catch (e) {
      console.error(e)
    }
    setDispatching(false)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Emergency Response</h2>
          <p className="subtitle">Multi-channel alert dispatch — {channelSummary.total_channels ?? 0} channels configured</p>
        </div>
      </div>

      {/* Channel Summary */}
      <div className="card-grid" style={{marginBottom: 16}}>
        {Object.entries(channelSummary.by_type || {}).map(([type, info]) => (
          <div key={type} className="stat-card">
            <span className="stat-label">{type.toUpperCase()}</span>
            <span className="stat-value accent">{info.count}</span>
            <span className="stat-detail">{info.channels?.slice(0, 2).join(', ')}{info.count > 2 ? ` +${info.count - 2} more` : ''}</span>
          </div>
        ))}
      </div>

      {/* Alert Composer */}
      <div className="card">
        <div className="card-header">
          <h3>Compose Emergency Alert</h3>
          <span className={`severity-badge severity-${alertForm.severity}`}>{alertForm.severity.toUpperCase()}</span>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16}}>
          <div className="form-group">
            <label>Alert Title</label>
            <input type="text" value={alertForm.title} onChange={e => setAlertForm({...alertForm, title: e.target.value})} style={{width: '100%'}} />
          </div>
          <div className="form-group">
            <label>Severity</label>
            <select value={alertForm.severity} onChange={e => setAlertForm({...alertForm, severity: e.target.value})} style={{width: '100%'}}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="severe">Severe</option>
              <option value="extreme">Extreme</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{marginBottom: 16}}>
          <label>Alert Description</label>
          <textarea rows={3} value={alertForm.description} onChange={e => setAlertForm({...alertForm, description: e.target.value})} style={{width: '100%', resize: 'vertical'}} />
        </div>

        <button className="btn btn-danger" onClick={handleDispatch} disabled={dispatching} style={{fontSize: 16, padding: '12px 32px'}}>
          {dispatching ? 'Dispatching...' : `🚨 DISPATCH TO ${channelSummary.total_channels ?? 0} CHANNELS`}
        </button>
      </div>

      {/* Dispatch Result */}
      {dispatchResult && (
        <div className="card" style={{borderColor: 'var(--success)'}}>
          <div className="card-header">
            <h3 style={{color: 'var(--success)'}}>Alert Dispatched Successfully</h3>
            <span style={{color: 'var(--success)', fontWeight: 700}}>{dispatchResult.channels_reached} channels reached</span>
          </div>
          <div style={{maxHeight: 400, overflowY: 'auto'}}>
            {dispatchResult.results?.map((r, i) => (
              <div key={i} className="channel-item">
                <span className="channel-icon">{r.icon}</span>
                <div>
                  <div style={{fontWeight: 500}}>{r.channel_name}</div>
                  <div style={{fontSize: 12, color: 'var(--text-muted)'}}>{r.channel_type}</div>
                </div>
                <span className="channel-status">SENT</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispatch Log */}
      {dispatchLog.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Recent Dispatch Log</h3></div>
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>Channel</th><th>Type</th><th>Subject</th><th>Status</th></tr>
            </thead>
            <tbody>
              {dispatchLog.slice(0, 20).map((m, i) => (
                <tr key={i}>
                  <td style={{fontSize: 12}}>{m.sent_at?.split('T')[1]?.slice(0, 8) ?? '—'}</td>
                  <td>{m.channel_name}</td>
                  <td><span className={`severity-badge severity-${m.message_type}`}>{m.message_type}</span></td>
                  <td>{m.subject}</td>
                  <td style={{color: 'var(--success)'}}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
