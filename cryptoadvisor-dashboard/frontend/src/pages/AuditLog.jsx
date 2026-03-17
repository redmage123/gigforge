import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const actionTypes = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'login_failed', label: 'Failed Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'password_change', label: 'Password Change' },
  { value: 'settings_change', label: 'Settings Change' },
  { value: 'api_key', label: 'API Key' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'alert', label: 'Alert' },
]

const actionColors = {
  login: '#00d4aa',
  login_failed: '#ff6b6b',
  failed_login: '#ff6b6b',
  logout: '#64748b',
  password_change: '#646cff',
  settings_change: '#646cff',
  api_key: '#facc15',
  wallet: '#00a3ff',
  alert: '#fb923c',
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const buildQuery = useCallback((pg) => {
    const params = new URLSearchParams()
    params.set('page', pg)
    params.set('limit', '25')
    if (actionFilter) params.set('action', actionFilter)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    return `/api/audit-log?${params.toString()}`
  }, [actionFilter, dateFrom, dateTo])

  const fetchLogs = useCallback(async (pg = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const res = await api.get(buildQuery(pg))
      const items = Array.isArray(res) ? res : res.logs || res.entries || []
      if (append) {
        setLogs((prev) => [...prev, ...items])
      } else {
        setLogs(items)
      }
      setHasMore(items.length >= 25)
      setPage(pg)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [buildQuery])

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  const loadMore = () => {
    fetchLogs(page + 1, true)
  }

  const getActionColor = (action) => {
    if (!action) return '#64748b'
    const lower = action.toLowerCase()
    for (const [key, color] of Object.entries(actionColors)) {
      if (lower.includes(key)) return color
    }
    return '#64748b'
  }

  const formatDate = (d) => {
    if (!d) return '--'
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  const selectStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '1rem',
  }

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Audit Log</h2>

      <Card className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Action Type</label>
            <select
              className="form-input"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={selectStyle}
            >
              {actionTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>From Date</label>
            <input
              className="form-input"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ ...selectStyle, colorScheme: 'dark' }}
            />
          </div>
          <div className="form-group">
            <label>To Date</label>
            <input
              className="form-input"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ ...selectStyle, colorScheme: 'dark' }}
            />
          </div>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading ? <LoadingSpinner /> : (
        <Card className="mt-1">
          {logs.length === 0 ? (
            <p className="muted">No audit log entries found.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a3d' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Timestamp</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Action</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Details</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => {
                      const action = log.action || log.type || log.event || ''
                      const color = getActionColor(action)
                      return (
                        <tr key={log.id || i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                          <td style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                            {formatDate(log.timestamp || log.created_at || log.date)}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              background: `${color}22`,
                              color,
                              padding: '0.2rem 0.6rem',
                              borderRadius: 10,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}>
                              {action}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', color: '#e2e8f0', fontSize: '0.9rem', maxWidth: 300 }}>
                            {log.details || log.description || log.message || '--'}
                          </td>
                          <td style={{ padding: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {log.ip_address || log.ip || '--'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button className="btn" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
