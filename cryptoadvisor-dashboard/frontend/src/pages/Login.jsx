import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../App'
import PasswordInput from '../components/PasswordInput'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const isChangePassword = location.pathname === '/change-password'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const params = new URLSearchParams(location.search)
  // Only same-site paths: never redirect to another site after sign-in
  const rawNext = params.get('next') || '/'
  const next = /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(rawNext) ? rawNext : '/'
  // Two-factor step: after the password (challenge in the response) or after company sign-in (?mfa=1, cookie)
  const [mfaStep, setMfaStep] = useState(() => params.get('mfa') === '1')
  const [challenge, setChallenge] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [providers, setProviders] = useState([])
  const [company, setCompany] = useState('')
  const [companyBusy, setCompanyBusy] = useState(false)

  useEffect(() => {
    if (params.get('sso_error')) setError(params.get('sso_error'))
    fetch('/api/sso/providers', { credentials: 'include' }).then((r) => (r.ok ? r.json() : { oidc: [] }))
      .then((d) => setProviders(d.oidc || [])).catch(() => {})
  }, [])

  const companySignIn = async (e) => {
    e.preventDefault()
    setError('')
    setCompanyBusy(true)
    try {
      const r = await fetch(`/api/sso/firm-login?q=${encodeURIComponent(company.trim())}`, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || d.error || 'No company sign-in found')
      window.location.href = `${d.url}?next=${encodeURIComponent(next)}`
    } catch (err) {
      setError(err.message)
      setCompanyBusy(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/api/auth/login', { username, password })
      if (data.mfa_required) {
        setChallenge(data.challenge)
        setMfaStep(true)
        setPassword('')
        return
      }
      signedIn(data)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const signedIn = (data) => {
    auth.login(data.token, { username: data.username, first_name: data.first_name, last_name: data.last_name, role: data.role,
      mfa_enrollment_required: !!data.mfa_enrollment_required })
    navigate(data.mfa_enrollment_required ? '/mfa-setup' : next)
  }

  const handleMfa = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // A 401 here (wrong code) must not bounce to /login like other API calls: plain fetch
      const r = await fetch('/api/auth/login/mfa', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode.trim(), ...(challenge ? { challenge } : {}) }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (data.code === 'expired') {
          setMfaStep(false)
          setChallenge(null)
        }
        setMfaCode('')
        throw new Error(data.error || 'Sign-in failed')
      }
      signedIn(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">
          {isChangePassword ? 'Change Password' : 'AssetAdvisor'}
        </h1>
        <p className="login-subtitle">
          {isChangePassword ? 'Update your password' : mfaStep ? 'Two-factor authentication' : 'Sign in to your dashboard'}
        </p>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">{success}</div>}

        {!isChangePassword && mfaStep ? (
          <form onSubmit={handleMfa}>
            <div className="form-group">
              <label htmlFor="mfa-code">{useRecovery ? 'Recovery code' : 'Code from your authenticator app'}</label>
              <input id="mfa-code" className="form-input" value={mfaCode} autoFocus required
                autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'}
                placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
                onChange={(e) => setMfaCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
            <button type="submit" className="btn login-btn" disabled={loading || (!useRecovery && mfaCode.length !== 6)}>
              {loading ? 'Checking...' : 'Verify'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setUseRecovery(!useRecovery); setMfaCode('') }}>
                {useRecovery ? 'Use a code from your app' : 'Lost your phone? Use a recovery code'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMfaStep(false); setChallenge(null); setMfaCode(''); setError('') }}>
                Start over
              </button>
            </p>
          </form>
        ) : isChangePassword ? (
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn login-btn" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                className="form-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn login-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {!isChangePassword && !mfaStep && (
          <div className="sso-section">
            <div className="sso-divider"><span>or</span></div>
            {providers.map((p) => (
              <a key={p.id} className="btn btn-secondary sso-btn" href={`/api/sso/oidc/${p.id}/start?next=${encodeURIComponent(next)}`}>
                Continue with {p.label}
              </a>
            ))}
            <form onSubmit={companySignIn} className="sso-company">
              <label htmlFor="company-signin">Sign in with your company</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="company-signin" className="form-input" placeholder="Work email or firm name" value={company}
                  onChange={(e) => setCompany(e.target.value)} required />
                <button type="submit" className="btn btn-secondary" disabled={companyBusy}>{companyBusy ? '…' : 'Continue'}</button>
              </div>
            </form>
          </div>
        )}

        {!isChangePassword && !mfaStep && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Don't have an account?{' '}
            <Link to={next !== '/' ? `/register?next=${encodeURIComponent(next)}` : '/register'} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default Login
