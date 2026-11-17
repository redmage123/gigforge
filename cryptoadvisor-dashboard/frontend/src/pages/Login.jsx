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
      auth.login(data.token, { username: data.username, first_name: data.first_name, last_name: data.last_name, role: data.role })
      navigate(next)
    } catch (err) {
      setError(err.message || 'Login failed')
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
          {isChangePassword ? 'Update your password' : 'Sign in to your dashboard'}
        </p>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">{success}</div>}

        {isChangePassword ? (
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

        {!isChangePassword && (
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

        {!isChangePassword && (
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
