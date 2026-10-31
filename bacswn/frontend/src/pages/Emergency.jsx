import { useState, useCallback, useRef } from 'react'
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
  const [dispatchError, setDispatchError] = useState('')
  const resultRef = useRef(null)

  const channelSummary = channelData || {}
  const dispatchLog = logData?.messages || []

  const handleDispatch = async () => {
    setDispatching(true)
    setDispatchError('')
    try {
      const result = await api.dispatchAlert(alertForm)
      setDispatchResult(result)
      refreshLog()
      requestAnimationFrame(() => resultRef.current?.focus())
    } catch (e) {
      // Never fail silently: an emergency alert that didn't go out must be obvious.
      setDispatchResult(null)
      setDispatchError(`Alert NOT dispatched: ${e.message}`)
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
          <span className={`severity-badge severity-${alertForm.severity}`}><span className="sr-only">Severity: </span>{alertForm.severity.toUpperCase()}</span>
        </div>

        <div className="grid-2" style={{gap: 12, marginBottom: 16}}>
          <div className="form-group">
            <label htmlFor="alert-title">Alert Title</label>
            <input id="alert-title" type="text" required value={alertForm.title} onChange={e => setAlertForm({...alertForm, title: e.target.value})} style={{width: '100%'}} />
          </div>
          <div className="form-group">
            <label htmlFor="alert-severity">Severity</label>
            <select id="alert-severity" value={alertForm.severity} onChange={e => setAlertForm({...alertForm, severity: e.target.value})} style={{width: '100%'}}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="severe">Severe</option>
              <option value="extreme">Extreme</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{marginBottom: 16}}>
          <label htmlFor="alert-desc">Alert Description</label>
          <textarea id="alert-desc" rows={3} required value={alertForm.description} onChange={e => setAlertForm({...alertForm, description: e.target.value})} style={{width: '100%', resize: 'vertical'}} />
        </div>

        <button type="button" className="btn btn-danger" onClick={handleDispatch} disabled={dispatching} style={{fontSize: 16, padding: '12px 32px'}}>
          {dispatching ? 'Dispatching…' : <><span aria-hidden="true">🚨 </span>DISPATCH TO {channelSummary.total_channels ?? 0} CHANNELS</>}
        </button>
        <div role="alert" className="error-msg" style={{ textAlign: 'left', fontWeight: 700 }}>{dispatchError}</div>
      </div>

      {/* Dispatch Result */}
      {dispatchResult && (
        <section className="card" style={{borderColor: 'var(--success)'}} aria-labelledby="dispatch-result-h">
          <div className="card-header">
            <h3 id="dispatch-result-h" tabIndex={-1} ref={resultRef} style={{color: 'var(--success-text)'}}>Alert Dispatched Successfully</h3>
            <span style={{color: 'var(--success-text)', fontWeight: 700}}>{dispatchResult.channels_reached} channels reached</span>
          </div>
          <div style={{maxHeight: 400, overflowY: 'auto'}} tabIndex={0} role="region" aria-label="Channels reached">
            {dispatchResult.results?.map((r, i) => (
              <div key={i} className="channel-item">
                <span className="channel-icon" aria-hidden="true">{r.icon}</span>
                <div>
                  <div style={{fontWeight: 500}}>{r.channel_name}</div>
                  <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>{r.channel_type}</div>
                </div>
                <span className="channel-status">SENT</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dispatch Log */}
      {dispatchLog.length > 0 && (
        <div className="card">
          <div className="card-header"><h3 id="dispatch-log-h">Recent Dispatch Log</h3></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="dispatch-log-h">
          <table className="data-table">
            <thead>
              <tr><th scope="col">Time (UTC)</th><th scope="col">Channel</th><th scope="col">Type</th><th scope="col">Subject</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {dispatchLog.slice(0, 20).map((m, i) => (
                <tr key={i}>
                  <td style={{fontSize: 12}}>{m.sent_at?.split('T')[1]?.slice(0, 8) ?? '—'}</td>
                  <td>{m.channel_name}</td>
                  <td><span className={`severity-badge severity-${m.message_type}`}>{m.message_type}</span></td>
                  <td>{m.subject}</td>
                  <td style={{color: 'var(--success-text)'}}>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
