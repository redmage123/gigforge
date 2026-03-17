import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Sessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState({})
  const [revokingAll, setRevokingAll] = useState(false)
  const [error, setError] = useState('')

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/sessions/')
      const list = Array.isArray(res) ? res : res.sessions || []
      setSessions(list)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const revokeSession = async (id) => {
    setRevoking((prev) => ({ ...prev, [id]: true }))
    try {
      await api.del(`/api/sessions/${id}`)
      await fetchSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setRevoking((prev) => ({ ...prev, [id]: false }))
    }
  }

  const revokeAllOthers = async () => {
    setRevokingAll(true)
    try {
      await api.post('/api/sessions/revoke-others', {})
      await fetchSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setRevokingAll(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '--'
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  const parseBrowser = (ua) => {
    if (!ua) return 'Unknown'
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return ua.slice(0, 40)
  }

  const otherSessions = sessions.filter((s) => !s.is_current && !s.current)

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Session Management</h2>

      {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading ? <LoadingSpinner /> : (
        <>
          <Card className="mt-1">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="muted">
                {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
              </div>
              {otherSessions.length > 0 && (
                <button
                  className="btn btn-danger"
                  onClick={revokeAllOthers}
                  disabled={revokingAll}
                >
                  {revokingAll ? 'Revoking...' : 'Revoke All Others'}
                </button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a3d' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>IP Address</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Browser</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Created</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Last Active</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', color: '#64748b' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const isCurrent = s.is_current || s.current
                    const id = s.id || s.session_id
                    return (
                      <tr key={id} style={{
                        borderBottom: '1px solid #1a1a2e',
                        background: isCurrent ? '#00d4aa08' : 'transparent',
                      }}>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {s.ip_address || s.ip || '--'}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0' }}>
                          {parseBrowser(s.user_agent || s.browser)}
                          {isCurrent && (
                            <span style={{
                              marginLeft: '0.5rem',
                              background: '#00d4aa22',
                              color: '#00d4aa',
                              padding: '0.15rem 0.5rem',
                              borderRadius: 10,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}>
                              Current
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                          {formatDate(s.created_at || s.created)}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                          {formatDate(s.last_active || s.last_seen || s.updated_at)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {isCurrent ? (
                            <span className="muted" style={{ fontSize: '0.85rem' }}>--</span>
                          ) : (
                            <button
                              className="btn btn-danger"
                              onClick={() => revokeSession(id)}
                              disabled={revoking[id]}
                              style={{ fontSize: '0.85rem', padding: '0.35rem 0.7rem' }}
                            >
                              {revoking[id] ? 'Revoking...' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
