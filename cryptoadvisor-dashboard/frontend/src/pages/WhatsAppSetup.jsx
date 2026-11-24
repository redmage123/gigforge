import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const KINDS = [
  ['alerts', 'Alerts', 'Price, RSI and Stochastic RSI alerts when they fire, with their time scale.'],
  ['in_play', 'In-Play', 'Instruments that just came into play under your In-Play rules (up to three per scan).'],
  ['briefing', 'Daily briefing', 'The AI market briefing once a day at the hour you choose.'],
  ['chat', 'Chat with the assistant', 'Message the AssetAdvisor assistant from WhatsApp and get answers there.'],
]

export default function WhatsAppSetup() {
  const [st, setSt] = useState(null)
  const [code, setCode] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => api.get('/api/whatsapp/').then(setSt).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])
  // While a code is showing, look for the link to complete (the user sends the code from their phone)
  useEffect(() => {
    if (!code || st?.linked) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [code, st?.linked, load])

  const run = async (key, fn, ok) => {
    setBusy(key); setError(''); setNotice('')
    try { const r = await fn(); if (ok) setNotice(ok(r)) } catch (e) { setError(e.message) } finally { setBusy('') }
  }
  const startLink = () => run('link', async () => setCode(await api.post('/api/whatsapp/link', {})))
  const savePrefs = (patch) => run('prefs', async () => setSt(await api.put('/api/whatsapp/prefs', { ...st.prefs, ...patch })), () => 'Saved.')
  const test = () => run('test', () => api.post('/api/whatsapp/test', {}), () => 'Test message sent. Check WhatsApp.')
  const unlink = () => {
    if (!window.confirm('Disconnect your WhatsApp number from AssetAdvisor?')) return
    run('unlink', async () => { setSt(await api.del('/api/whatsapp/')); setCode(null) }, () => 'WhatsApp disconnected.')
  }

  if (!st) return error ? <Card title="WhatsApp"><p className="negative">{error}</p></Card> : <LoadingSpinner />

  const tzOffset = -new Date().getTimezoneOffset()
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginTop: 0 }}>WhatsApp</h1>
      <p className="muted">
        Get your alerts on WhatsApp and chat with the AssetAdvisor assistant there. Messages come from AssetAdvisor's
        official WhatsApp Business number; you can reply STOP at any time to pause them.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {notice && <p className="positive" role="status">{notice}</p>}

      {!st.available ? (
        <Card title="Not available yet">
          <p className="muted" style={{ margin: 0 }}>WhatsApp isn't set up on this server yet. Your administrator can enable it (see the runbook).</p>
        </Card>
      ) : !st.entitled ? (
        <Card title="WhatsApp is part of Pro">
          <p style={{ marginTop: 0 }}>
            WhatsApp charges for every message a business sends, so alerts, In-Play, the daily briefing and chat on
            WhatsApp come with the Pro plan. Everything else in AssetAdvisor stays free.
          </p>
          {st.linked && <p className="muted" style={{ fontSize: '0.85rem' }}>Your number {st.phone} is still linked, but nothing is sent to it until you subscribe.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
            <Link className="btn" to="/billing">{st.payments_enabled ? 'See the Pro plan' : 'See plans (subscriptions open soon)'}</Link>
            {st.linked && <button type="button" className="btn btn-sm btn-ghost" onClick={unlink} disabled={!!busy}>Disconnect number</button>}
          </div>
        </Card>
      ) : !st.linked ? (
        <Card title="Link your WhatsApp">
          {!code ? (
            <>
              <p>You'll send a short code from your own WhatsApp. That proves the number is yours, and nothing else is needed.</p>
              <button type="button" className="btn" onClick={startLink} disabled={busy === 'link'}>{busy === 'link' ? 'Getting a code…' : 'Link WhatsApp'}</button>
            </>
          ) : (
            <>
              <ol style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>On your phone, <a href={code.url} target="_blank" rel="noopener noreferrer">open WhatsApp with the code filled in</a>,
                  or message <strong>+{st.business_number}</strong> yourself.</li>
                <li>Send exactly: <code style={{ fontSize: '1.1rem' }}>{code.text}</code></li>
                <li>This page updates by itself when it's done. The code works for 15 minutes.</li>
              </ol>
              <p className="muted" role="status" aria-live="polite">Waiting for your message…</p>
              <button type="button" className="btn btn-sm btn-ghost" onClick={startLink}>Get a new code</button>
            </>
          )}
        </Card>
      ) : (
        <>
          <Card title="Linked number">
            <p style={{ marginTop: 0 }}>
              <strong>{st.phone}</strong>{st.linked_at && <span className="muted"> · linked {new Date(st.linked_at * 1000).toLocaleDateString()}</span>}
              {st.paused && <span className="negative"> · paused (you sent STOP; send START to resume)</span>}
            </p>
            {!st.window_open && !st.can_send_anytime && (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                WhatsApp only lets businesses message you within 24 hours of your last message to them. Send any
                message (for example HELP) to AssetAdvisor on WhatsApp now and then so alerts keep arriving.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send a test message'}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={unlink} disabled={!!busy}>Disconnect</button>
            </div>
          </Card>

          <Card title="What to send to WhatsApp" className="mt-1">
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">What to send to WhatsApp</legend>
              {KINDS.map(([k, label, hint]) => (
                <label key={k} htmlFor={`wa-${k}`} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0' }}>
                  <input id={`wa-${k}`} type="checkbox" checked={!!st.prefs[k]} disabled={busy === 'prefs'}
                    onChange={(e) => savePrefs({ [k]: e.target.checked, ...(k === 'briefing' ? { tz_offset_min: tzOffset } : {}) })} />
                  <span><strong>{label}</strong><br /><span className="muted" style={{ fontSize: '0.85rem' }}>{hint}</span></span>
                </label>
              ))}
            </fieldset>
            {st.prefs.briefing && (
              <label htmlFor="wa-hour" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                Send the briefing at
                <select id="wa-hour" className="input" style={{ width: 'auto' }} value={st.prefs.briefing_hour}
                  onChange={(e) => savePrefs({ briefing_hour: Number(e.target.value), tz_offset_min: tzOffset })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
                <span className="muted" style={{ fontSize: '0.85rem' }}>your time</span>
              </label>
            )}
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
              Choose which alerts exist, and their time scales, on the <Link to="/alerts">Alerts</Link> page. On WhatsApp,
              send HELP for commands, STOP to pause everything, START to resume, UNLINK to disconnect.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
