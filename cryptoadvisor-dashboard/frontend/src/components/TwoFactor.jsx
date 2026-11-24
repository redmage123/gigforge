import { useEffect, useState } from 'react'
import { renderSVG } from 'uqr'
import { api } from '../api/client'
import Card from './Card'
import PasswordInput from './PasswordInput'

const codeInputProps = {
  className: 'form-input',
  inputMode: 'numeric',
  autoComplete: 'one-time-code',
  maxLength: 6,
  pattern: '[0-9]{6}',
  placeholder: '123456',
  style: { maxWidth: 160, letterSpacing: '0.2em' },
}

// Recovery codes are shown once, right after they're made
export function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true)).catch(() => {})
  }
  const download = () => {
    const blob = new Blob([`AssetAdvisor recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'assetadvisor-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <strong>Save these recovery codes now.</strong> Each one signs you in once if you lose your phone. They won't be shown again.
      </p>
      <ol style={{ fontFamily: 'monospace', fontSize: '1rem', columns: 2, maxWidth: 360, paddingLeft: '1.5rem' }}>
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>Download</button>
        <button type="button" className="btn btn-sm" onClick={onDone}>I've saved them</button>
      </div>
    </div>
  )
}

// Setup: new key -> QR code / manual key -> confirm with a code -> recovery codes
export function TwoFactorSetup({ onEnabled, onCancel }) {
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setBusy(true); setError('')
    try { setSetup(await api.post('/api/2fa/setup', {})) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const confirm = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await api.post('/api/2fa/confirm', { code: code.trim() })
      setCodes(r.recovery_codes)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={() => onEnabled?.()} />
  if (!setup) {
    return (
      <div>
        <button type="button" className="btn" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Show my QR code'}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>}
        {error && <p className="negative" role="alert">{error}</p>}
      </div>
    )
  }
  const qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(setup.otpauth_uri, { border: 2 }))}`
  const grouped = setup.secret.match(/.{1,4}/g).join(' ')
  return (
    <div>
      <ol style={{ paddingLeft: '1.25rem', marginTop: 0 }}>
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
        <li>Scan this QR code, or enter the key by hand (time-based, 6 digits).</li>
      </ol>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <img src={qr} width={180} height={180} alt="QR code for your authenticator app"
          style={{ background: '#fff', padding: 6, borderRadius: 6 }} />
        <div style={{ fontSize: '0.85rem' }}>
          <div className="muted">Key</div>
          <code style={{ fontSize: '1rem', wordBreak: 'break-all' }}>{grouped}</code>
          <div className="muted" style={{ marginTop: 6 }}>Account: {setup.account} · Issuer: {setup.issuer}</div>
        </div>
      </div>
      <form onSubmit={confirm} style={{ marginTop: 12 }}>
        <label htmlFor="mfa-confirm-code">3. Enter the 6-digit code the app shows</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input id="mfa-confirm-code" {...codeInputProps} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          <button type="submit" className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</button>
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
      {error && <p className="negative" role="alert">{error}</p>}
    </div>
  )
}

// Settings card: status, set up, new recovery codes, turn off
export default function TwoFactorCard() {
  const [st, setSt] = useState(null)
  const [mode, setMode] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => api.get('/api/2fa/status').then(setSt).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const reset = () => { setMode(''); setPassword(''); setCode(''); setError('') }
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      if (mode === 'disable') {
        await api.post('/api/2fa/disable', { password, code: code.trim() })
        setMsg('Two-factor authentication is off.')
      } else {
        const r = await api.post('/api/2fa/recovery-codes', { code: code.trim() })
        setCodes(r.recovery_codes)
      }
      reset()
      load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!st) return null
  return (
    <Card title="Two-factor authentication" className="mt-1">
      {msg && <p className="positive" style={{ marginTop: 0 }}>{msg}</p>}
      {st.required_by?.length > 0 && (
        <p className="muted" style={{ marginTop: 0 }}>Required by {st.required_by.join(', ')}.</p>
      )}
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : !st.enabled ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Off. Turn it on to ask for a code from an authenticator app on your phone whenever you sign in.
          </p>
          {mode === 'setup' ? (
            <TwoFactorSetup onEnabled={() => { reset(); setMsg('Two-factor authentication is on.'); load() }} onCancel={reset} />
          ) : (
            <button type="button" className="btn" onClick={() => setMode('setup')}>Set up two-factor authentication</button>
          )}
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            <strong className="positive">On</strong>
            {st.enabled_at && <span className="muted"> since {new Date(st.enabled_at).toLocaleDateString()}</span>}
            <span className="muted"> · {st.recovery_codes_left} recovery code{st.recovery_codes_left === 1 ? '' : 's'} left</span>
          </p>
          {!mode && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('codes')}>New recovery codes</button>
              {!st.required_by?.length && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setMode('disable')}>Turn off</button>
              )}
            </div>
          )}
          {mode && (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 400 }}>
              <p className="muted" style={{ margin: 0 }}>
                {mode === 'disable' ? 'To turn off two-factor authentication, confirm it’s you.' : 'Your current recovery codes will stop working.'}
              </p>
              {mode === 'disable' && st.password_required && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="mfa-password">Your password</label>
                  <PasswordInput id="mfa-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="mfa-code">Code from your app, or a recovery code</label>
                <input id="mfa-code" className="form-input" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)} required style={{ maxWidth: 220 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className={mode === 'disable' ? 'btn btn-danger' : 'btn'} disabled={busy}>
                  {busy ? 'Checking…' : mode === 'disable' ? 'Turn off' : 'Make new codes'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}
