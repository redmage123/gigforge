import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

// Categories match action prefixes on the server (e.g. "auth.login" covers sign-ins and failed sign-ins)
const actionTypes = [
  { value: '', label: 'All Actions' },
  { value: 'auth.login', label: 'Sign-ins (including failed)' },
  { value: 'auth.logout', label: 'Sign-outs' },
  { value: 'auth.password_change', label: 'Password Changes' },
  { value: 'auth.session', label: 'Signed-out Sessions' },
  { value: 'account', label: 'Account' },
  { value: 'sso', label: 'Connected Sign-ins' },
  { value: 'mfa', label: 'Two-factor Authentication' },
  { value: 'portfolio', label: 'Portfolios' },
  { value: 'trade', label: 'Trades and Orders' },
  { value: 'cash', label: 'Cash Movements' },
  { value: 'broker', label: 'Broker Connections' },
  { value: 'allocation', label: 'Allocation Targets' },
  { value: 'firm', label: 'Firm Administration' },
  { value: 'whatsapp', label: 'WhatsApp' },
]

const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_refused': 'Sign-in refused',
  'auth.logout': 'Signed out',
  'auth.password_change': 'Password changed',
  'auth.session_revoke': 'Session signed out',
  'auth.sessions_revoke_others': 'Other sessions signed out',
  'account.register': 'Account created',
  'account.create_sso': 'Account created (company sign-in)',
  'sso.link': 'Sign-in connected',
  'sso.unlink': 'Sign-in disconnected',
  'mfa.enabled': 'Two-factor turned on',
  'mfa.disabled': 'Two-factor turned off',
  'mfa.challenge_failed': 'Wrong two-factor code',
  'mfa.recovery_used': 'Recovery code used',
  'mfa.recovery_regenerated': 'New recovery codes',
}

const actionColors = {
  login_failed: '#ff6b6b',
  login_refused: '#ff6b6b',
  login: '#00d4aa',
  logout: '#64748b',
  password: '#646cff',
  session: '#646cff',
  sso: '#646cff',
  mfa: '#646cff',
  account: '#646cff',
  broker: '#facc15',
  trade: '#00a3ff',
  cash: '#00a3ff',
  portfolio: '#00a3ff',
  firm: '#fb923c',
}

const PAGE_SIZE = 25

const labelFor = (action) => ACTION_LABELS[action] || action.replace(/[._]/g, ' ')

const formatValue = (v) => {
  if (v === null || v === undefined || v === '') return '--'
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${formatValue(x)}`).join(', ')
  return String(v)
}

// details is an object (or a string in older entries): show it as "Key: value" lines
function Details({ details, target }) {
  const pairs = []
  if (target) pairs.push(['target', target])
  if (typeof details === 'string') {
    if (details) pairs.push(['', details])
  } else if (details && typeof details === 'object') {
    for (const [k, v] of Object.entries(details)) pairs.push([k === 'details' ? '' : k, v])
  }
  if (pairs.length === 0) return '--'
  return pairs.map(([k, v], i) => (
    <div key={i}>
      {k && <span className="muted">{k.replace(/_/g, ' ')}: </span>}
      {formatValue(v)}
    </div>
  ))
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [nextCursor, setNextCursor] = useState(null)

  const buildQuery = useCallback((cursor) => {
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    if (cursor) params.set('cursor', cursor)
    if (actionFilter) params.set('action', actionFilter)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    return `/api/audit/?${params.toString()}`
  }, [actionFilter, dateFrom, dateTo])

  const fetchLogs = useCallback(async (cursor = null) => {
    const append = Boolean(cursor)
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const res = await api.get(buildQuery(cursor))
      const items = res.entries || []
      setLogs((prev) => (append ? [...prev, ...items] : items))
      setNextCursor(res.next_cursor || null)
    } catch (err) {
      if (!append) setLogs([])
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [buildQuery])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const loadMore = () => {
    if (nextCursor) fetchLogs(nextCursor)
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
      <p className="muted" style={{ marginTop: 0 }}>Security and account activity on your account, newest first. Times are shown in your time zone; the date filters use UTC days.</p>

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
                      const action = log.action || ''
                      const color = getActionColor(action)
                      return (
                        <tr key={log.id || i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                          <td style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                            {formatDate(log.timestamp)}
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
                            }} title={action}>
                              {labelFor(action)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', color: '#e2e8f0', fontSize: '0.9rem', maxWidth: 300 }}>
                            <Details details={log.details} target={log.target} />
                          </td>
                          <td style={{ padding: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {log.ip_address || '--'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {nextCursor && (
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
