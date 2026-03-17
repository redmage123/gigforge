import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

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

  // 2FA
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [toggling2FA, setToggling2FA] = useState(false)

  // Display
  const [theme, setTheme] = useState('dark')
  const [currency, setCurrency] = useState('usd')
  const [savingDisplay, setSavingDisplay] = useState(false)

  // Dashboard widgets
  const [widgets, setWidgets] = useState([])
  const [savingWidgets, setSavingWidgets] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)

  // Notifications
  const [pushEnabled, setPushEnabled] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/settings/')
      setSettings(res)
      setTwoFAEnabled(res.two_fa_enabled ?? res.twoFA ?? false)
      setTheme(res.theme || 'dark')
      setCurrency(res.currency || 'usd')
      setPushEnabled(res.push_notifications ?? res.notifications?.push ?? false)
      setWidgets(res.widget_layout || res.widgets || res.dashboard_widgets || [
        { id: 'market_overview', name: 'Market Overview', enabled: true },
        { id: 'price_cards', name: 'Top Coins', enabled: true },
        { id: 'fear_greed', name: 'Fear & Greed Index', enabled: true },
        { id: 'dominance', name: 'Market Dominance', enabled: true },
        { id: 'volume', name: 'Volume Chart', enabled: true },
        { id: 'portfolio_summary', name: 'Portfolio Summary', enabled: true },
        { id: 'alerts_summary', name: 'Active Alerts', enabled: true },
        { id: 'recent_trades', name: 'Recent Activity', enabled: true },
      ])
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
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setChangingPassword(true)
    setError('')
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
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

  const toggle2FA = async () => {
    if (twoFAEnabled) {
      // Disable
      setToggling2FA(true)
      setError('')
      try {
        await api.post('/api/settings/2fa/disable', { code: twoFACode })
        setTwoFAEnabled(false)
        setQrCode('')
        setTwoFACode('')
        showSuccess('2FA disabled')
      } catch (err) {
        setError(err.message)
      } finally {
        setToggling2FA(false)
      }
    } else {
      // Enable - first get QR
      setToggling2FA(true)
      setError('')
      try {
        const res = await api.post('/api/settings/2fa/enable', {})
        setQrCode(res.qr_code || res.qr || res.otpauth_url || '')
        if (twoFACode) {
          // Verify code
          await api.post('/api/settings/2fa/verify', { code: twoFACode })
          setTwoFAEnabled(true)
          setQrCode('')
          setTwoFACode('')
          showSuccess('2FA enabled')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setToggling2FA(false)
      }
    }
  }

  const saveDisplay = async () => {
    setSavingDisplay(true)
    setError('')
    try {
      await api.post('/api/settings/display', { theme, currency })
      showSuccess('Display settings saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingDisplay(false)
    }
  }

  const toggleWidget = (index) => {
    setWidgets((prev) => prev.map((w, i) =>
      i === index ? { ...w, enabled: !w.enabled } : w
    ))
  }

  const handleDragStart = (index) => {
    setDragIndex(index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setWidgets((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  const saveWidgets = async () => {
    setSavingWidgets(true)
    setError('')
    try {
      await api.put('/api/settings/widgets', { layout: widgets })
      showSuccess('Widget layout saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingWidgets(false)
    }
  }

  const saveNotifications = async () => {
    setSavingNotif(true)
    setError('')
    try {
      await api.post('/api/settings/notifications', { push_enabled: pushEnabled })
      showSuccess('Notification settings saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingNotif(false)
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

  const currencies = [
    { value: 'usd', label: 'USD ($)' },
    { value: 'eur', label: 'EUR (E)' },
    { value: 'gbp', label: 'GBP (P)' },
    { value: 'jpy', label: 'JPY (Y)' },
    { value: 'btc', label: 'BTC' },
    { value: 'eth', label: 'ETH' },
  ]

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
              <input
                className="form-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                className="form-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                className="form-input"
                type="password"
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

      {/* Security Section */}
      <Card title="Security" className="mt-1">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <h4 style={{ color: '#e2e8f0', margin: 0 }}>Two-Factor Authentication</h4>
              <span style={{
                background: twoFAEnabled ? '#00d4aa22' : '#ff6b6b22',
                color: twoFAEnabled ? '#00d4aa' : '#ff6b6b',
                padding: '0.15rem 0.5rem',
                borderRadius: 10,
                fontSize: '0.8rem',
                fontWeight: 600,
              }}>
                {twoFAEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {qrCode && !twoFAEnabled && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="muted" style={{ marginBottom: '0.5rem' }}>
                  Scan this QR code with your authenticator app:
                </p>
                <div style={{
                  background: '#fff',
                  padding: '1rem',
                  borderRadius: 8,
                  display: 'inline-block',
                  marginBottom: '0.75rem',
                }}>
                  <img src={qrCode} alt="2FA QR Code" style={{ width: 200, height: 200 }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', maxWidth: 400 }}>
              {(!twoFAEnabled || twoFAEnabled) && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>{twoFAEnabled ? 'Enter code to disable' : 'Enter code to verify'}</label>
                  <input
                    className="form-input"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                  />
                </div>
              )}
              <button
                className={twoFAEnabled ? 'btn btn-danger' : 'btn'}
                onClick={toggle2FA}
                disabled={toggling2FA}
              >
                {toggling2FA ? 'Processing...' : twoFAEnabled ? 'Disable 2FA' : 'Enable 2FA'}
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #2a2a3d', paddingTop: '1rem' }}>
            <a href="/sessions" style={{ color: '#00d4aa', textDecoration: 'none' }}>
              Manage Active Sessions
            </a>
          </div>
        </div>
      </Card>

      {/* Display Section */}
      <Card title="Display" className="mt-1">
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Theme</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['dark', 'light'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '0.5rem 1.2rem',
                    borderRadius: 8,
                    border: `1px solid ${theme === t ? '#00d4aa' : '#2a2a3d'}`,
                    background: theme === t ? '#00d4aa22' : '#12121f',
                    color: theme === t ? '#00d4aa' : '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={saveDisplay} disabled={savingDisplay}>
            {savingDisplay ? 'Saving...' : 'Save Display Settings'}
          </button>
        </div>
      </Card>

      {/* Dashboard Widgets */}
      <Card title="Dashboard Widgets" className="mt-1">
        <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          Drag to reorder. Toggle to enable or disable widgets on your dashboard.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {widgets.map((w, i) => (
            <div
              key={w.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 1rem',
                background: dragIndex === i ? '#00d4aa11' : '#12121f',
                border: `1px solid ${dragIndex === i ? '#00d4aa44' : '#2a2a3d'}`,
                borderRadius: 8,
                cursor: 'grab',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: '#64748b', fontSize: '1.2rem', cursor: 'grab' }}>&#8942;&#8942;</span>
                <span style={{ color: w.enabled ? '#e2e8f0' : '#64748b' }}>{w.name}</span>
              </div>
              <button
                onClick={() => toggleWidget(i)}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 12,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: w.enabled ? '#00d4aa22' : '#2a2a3d',
                  color: w.enabled ? '#00d4aa' : '#64748b',
                }}
              >
                {w.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={saveWidgets} disabled={savingWidgets}>
          {savingWidgets ? 'Saving...' : 'Save Widget Layout'}
        </button>
      </Card>

      {/* Notifications */}
      <Card title="Notifications" className="mt-1">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 400 }}>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 500 }}>Push Notifications</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Receive browser push notifications for alerts</div>
          </div>
          <button
            onClick={() => setPushEnabled(!pushEnabled)}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: 'none',
              cursor: 'pointer',
              background: pushEnabled ? '#00d4aa' : '#2a2a3d',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: pushEnabled ? 25 : 3,
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
        <button className="btn" onClick={saveNotifications} disabled={savingNotif} style={{ marginTop: '1rem' }}>
          {savingNotif ? 'Saving...' : 'Save Notification Settings'}
        </button>
      </Card>
    </div>
  )
}
