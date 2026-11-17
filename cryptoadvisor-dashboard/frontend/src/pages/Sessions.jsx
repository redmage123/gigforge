import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const METHOD = { password: 'Password', register: 'New account', google: 'Google', microsoft: 'Microsoft', saml: 'Company sign-in' }

// Order matters: Edge and Opera user agents also contain "Chrome", Chrome's contains "Safari"
function describe(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  if (browser || os) return [browser, os].filter(Boolean).join(' on ')
  return ua ? ua.slice(0, 40) : 'Unknown device'
}

const when = (d) => (d ? new Date(d).toLocaleString() : '—')

export default function Sessions() {
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => api.get('/api/sessions/').then((r) => setList(r.sessions)).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const act = async (key, fn, message) => {
    setBusy(key); setError(''); setNotice('')
    try { const r = await fn(); setNotice(message(r)); await load() } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const revoke = (s) => act(s.id, () => api.del(`/api/sessions/${encodeURIComponent(s.id)}`), () => `Signed out ${describe(s.user_agent)}.`)
  const revokeOthers = () => {
    if (!window.confirm('Sign out every other device? This one stays signed in.')) return
    act('others', () => api.post('/api/sessions/revoke-others', {}), (r) => `Signed out ${r.ended} other session${r.ended === 1 ? '' : 's'}.`)
  }

  const others = (list || []).filter((s) => !s.current)

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Active sessions</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Every device or browser signed in to your account. If you don't recognize one, sign it out and change your
        password; changing your password also signs out every other device.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {notice && <p className="positive" role="status">{notice}</p>}
      {!list ? <LoadingSpinner /> : (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <span className="muted">{list.length} active session{list.length === 1 ? '' : 's'}</span>
            {others.length > 0 && (
              <button type="button" className="btn btn-danger" disabled={!!busy} onClick={revokeOthers}>
                {busy === 'others' ? 'Signing out…' : 'Sign out all other devices'}
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead><tr><th>Device</th><th>Signed in with</th><th>IP address</th><th>Signed in</th><th>Last active</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{describe(s.user_agent)}</strong>
                      {s.current && <span className="positive" style={{ marginLeft: 8, fontSize: '0.8rem', fontWeight: 600 }}>This device</span>}
                    </td>
                    <td>{METHOD[s.method] || s.method || '—'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{s.ip || '—'}</td>
                    <td className="muted">{when(s.created_at)}</td>
                    <td className="muted">{when(s.last_seen_at)}</td>
                    <td className="muted">{when(s.expires_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {s.current ? <span className="muted" style={{ fontSize: '0.85rem' }}>Use Logout</span> : (
                        <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => revoke(s)}
                          aria-label={`Sign out ${describe(s.user_agent)} from ${s.ip || 'unknown IP'}`}>
                          {busy === s.id ? 'Signing out…' : 'Sign out'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
