import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { TwoFactorSetup } from '../components/TwoFactor'

// Members of a firm that requires two-factor authentication land here until they set it up;
// the server allows nothing else for their session in the meantime.
export default function MfaSetup() {
  const navigate = useNavigate()
  const { user, login, logout } = useAuth()

  const done = async () => {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' })
      const me = r.ok ? await r.json() : null
      if (me?.username) login(localStorage.getItem('token') || 'cookie-session', me)
    } catch { /* the next page load refreshes it */ }
    navigate('/', { replace: true })
  }

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: 560 }}>
        <h1 className="login-title">Set up two-factor authentication</h1>
        <p className="login-subtitle">
          Your firm requires a code from an authenticator app when you sign in. Set it up to continue
          {user?.username ? `, ${user.first_name || user.username}` : ''}.
        </p>
        <TwoFactorSetup onEnabled={done} />
        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { logout(); window.location.href = '/login' }}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
