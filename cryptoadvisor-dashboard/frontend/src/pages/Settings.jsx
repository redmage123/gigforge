import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import PasswordInput from '../components/PasswordInput'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../App'

// Permanent account deletion: password + typing DELETE, then sign out
function DeleteAccount() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/delete-account', { password, confirm })
      logout()
      window.location.href = '/login'
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Delete account" className="mt-1">
      <p className="muted" style={{ marginTop: 0 }}>
        Permanently deletes your account and all your data: trades, alerts, watchlist, settings, AI memory and
        phone-alert setup. This can't be undone. You can <a href="/data-export">export your data</a> first.
      </p>
      {!open ? (
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 400 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="del-password">Your password <span className="muted" style={{ fontWeight: 400 }}>(if you only sign in with your company, type your username)</span></label>
            <PasswordInput id="del-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="del-confirm">Type DELETE to confirm</label>
            <input id="del-confirm" className="form-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="off" />
          </div>
          {error && <p className="negative" style={{ margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-danger" disabled={busy || confirm !== 'DELETE' || !password}>
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setPassword(''); setConfirm('') }}>Cancel</button>
          </div>
        </form>
      )}
    </Card>
  )
}

const PROVIDER_LABEL = (p) => (p === 'google' ? 'Google' : p === 'microsoft' ? 'Microsoft' : p.startsWith('saml:') ? 'Company sign-in (SAML)' : p)

// Google / Microsoft accounts linked to this login (company SAML links are made from the firm's sign-in)
function ConnectedSignIns() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const linked = new URLSearchParams(window.location.search).get('sso_linked')
  const ssoError = new URLSearchParams(window.location.search).get('sso_error')
  useEffect(() => { api.get('/api/sso/identities').then(setData).catch((e) => setError(e.message)) }, [])
  const unlink = async (provider) => {
    setError('')
    try { setData({ ...data, ...(await api.del(`/api/sso/identities/${encodeURIComponent(provider)}`)) }) } catch (e) { setError(e.message) }
  }
  if (!data || (!data.providers.length && !data.identities.length)) return null
  const have = new Set(data.identities.map((i) => i.provider))
  return (
    <Card title="Connected sign-ins" className="mt-1">
      {linked && <p className="positive" style={{ marginTop: 0 }}>{PROVIDER_LABEL(linked)} is now connected.</p>}
      {ssoError && <p className="negative" style={{ marginTop: 0 }}>{ssoError}</p>}
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>Sign in with these instead of your password.</p>
      {data.identities.map((i) => (
        <div key={i.provider} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', flexWrap: 'wrap' }}>
          <strong>{PROVIDER_LABEL(i.provider)}</strong><span className="muted">{i.email}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => unlink(i.provider)}>Disconnect</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {data.providers.filter((p) => !have.has(p.id)).map((p) => (
          <a key={p.id} className="btn btn-sm btn-secondary" href={`/api/sso/oidc/${p.id}/start?intent=link&next=/settings`}>Connect {p.label}</a>
        ))}
      </div>
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/settings/')
      setSettings(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const showSuccess = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters')
      return
    }
    setChangingPassword(true)
    setError('')
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showSuccess('Password changed successfully')
    } catch (err) {
      setError(err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Settings</h2>

      {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && (
        <div style={{
          background: '#00d4aa22',
          border: '1px solid #00d4aa55',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          color: '#00d4aa',
          marginBottom: '1rem',
        }}>
          {success}
        </div>
      )}

      {/* Profile Section */}
      <Card title="Profile" className="mt-1">
        <div style={{ marginBottom: '1rem' }}>
          <span className="muted">Username: </span>
          <strong style={{ color: '#e2e8f0' }}>{settings?.username || settings?.user || '--'}</strong>
        </div>

        <h4 style={{ color: '#e2e8f0', marginBottom: '0.75rem' }}>Change Password</h4>
        <form onSubmit={changePassword}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 400 }}>
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
                minLength={10}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn" disabled={changingPassword} style={{ alignSelf: 'flex-start' }}>
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </Card>

      <ConnectedSignIns />

      {/* Security Section */}
      <Card title="Security" className="mt-1">
        <a href="/sessions" style={{ color: '#00d4aa', textDecoration: 'none' }}>
          Manage Active Sessions
        </a>
      </Card>

      {/* The dashboard is customized on the dashboard itself */}
      <Card title="Dashboard" className="mt-1">
        <p style={{ margin: 0 }}>
          Choose, reorder and resize the dashboard's tiles, and pick the instruments in each Markets tile, right on the
          dashboard: select <strong>Customize dashboard</strong> at the top of it. <Link to="/">Go to the dashboard</Link>
        </p>
      </Card>

      <Card title="WhatsApp" className="mt-1">
        <p style={{ margin: 0 }}>
          Get alerts, In-Play and a daily briefing on WhatsApp, and chat with the assistant there. <Link to="/whatsapp">Set up WhatsApp</Link>
        </p>
      </Card>

      <DeleteAccount />
    </div>
  )
}
