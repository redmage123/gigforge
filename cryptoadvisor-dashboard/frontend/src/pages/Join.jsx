import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../App'

const ROLE_TEXT = {
  admin: 'Admin: manage members, sign-in and all portfolios',
  pm: 'Portfolio manager: create and manage portfolios, log trades',
  analyst: 'Analyst: view all firm portfolios',
  compliance: 'Compliance: view portfolios, the audit trail and access reviews',
  viewer: 'Viewer: view all firm portfolios',
}

// Firm invitation link: /join/<token>. Works signed in or out (sign-in returns here).
export default function Join() {
  const { token } = useParams()
  const { token: session, checking } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/firms/invite-info?token=${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.detail || d.error); setInfo(d) })
      .catch((e) => setError(e.message || 'This invitation is not valid'))
  }, [token])

  const accept = async () => {
    setBusy(true); setError('')
    try {
      const r = await api.post('/api/firms/accept-invite', { token })
      window.location.href = `/firm/${r.firm_id}`
    } catch (e) { setError(e.message); setBusy(false) }
  }

  const here = `/join/${token}`
  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">AssetAdvisor</h1>
        {error && <div className="login-error">{error}</div>}
        {info && (
          <>
            <p className="login-subtitle">You're invited to join <strong>{info.firm_name}</strong></p>
            <p style={{ textAlign: 'center' }}>{ROLE_TEXT[info.role] || info.role}</p>
            {checking ? null : session ? (
              <button type="button" className="btn login-btn" disabled={busy} onClick={accept}>{busy ? 'Joining…' : `Join ${info.firm_name}`}</button>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" className="btn login-btn" onClick={() => navigate(`/login?next=${encodeURIComponent(here)}`)}>Sign in to accept</button>
                <Link className="btn btn-secondary" style={{ textAlign: 'center' }} to={`/register?next=${encodeURIComponent(here)}`}>Create an account</Link>
              </div>
            )}
            <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>Link expires {new Date(info.expires_at).toLocaleDateString()}.</p>
          </>
        )}
      </div>
    </div>
  )
}
