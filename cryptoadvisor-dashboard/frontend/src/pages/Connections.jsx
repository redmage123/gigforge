import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { usePortfolios } from '../hooks/usePortfolios'

const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--muted)' }
const PROVIDER = { alpaca: 'Alpaca', plaid: 'Plaid', snaptrade: 'SnapTrade' }

// Plaid's own Link widget, loaded only when someone connects through Plaid
function loadPlaid() {
  if (window.Plaid) return Promise.resolve(window.Plaid)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    s.onload = () => resolve(window.Plaid)
    s.onerror = () => reject(new Error("Couldn't load Plaid"))
    document.head.appendChild(s)
  })
}

export default function Connections() {
  const { label, combined, bookOptions, canWrite, current, selected } = usePortfolios()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [book, setBook] = useState('')
  const [alp, setAlp] = useState({ key_id: '', secret_key: '', paper: false })
  const target = combined ? (book || bookOptions.find((p) => p.default)?.id || bookOptions[0]?.id) : undefined
  const targetName = combined ? bookOptions.find((p) => p.id === target)?.name : label

  const load = () => api.get('/api/brokers/').then(setData).catch((e) => setError(e.message))
  useEffect(() => { setData(null); load() }, [current])

  const run = async (key, fn) => {
    setBusy(key); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(''); load() }
  }
  const connectAlpaca = (e) => {
    e.preventDefault()
    run('alpaca', async () => {
      const r = await api.post('/api/brokers/alpaca', { ...alp, portfolio_id: target })
      setAlp({ key_id: '', secret_key: '', paper: alp.paper })
      setNotice(`Connected. ${r.first_sync.message}.`)
      window.dispatchEvent(new CustomEvent('assetadvisor:data-changed'))
    })
  }
  const connectPlaid = () => run('plaid', async () => {
    const { link_token } = await api.post('/api/brokers/plaid/link-token', {})
    const Plaid = await loadPlaid()
    await new Promise((resolve, reject) => {
      Plaid.create({
        token: link_token,
        onSuccess: async (public_token, meta) => {
          try {
            const r = await api.post('/api/brokers/plaid/exchange', { public_token, institution: meta?.institution?.name || '', portfolio_id: target })
            setNotice(`Connected ${meta?.institution?.name || 'your broker'}. ${r.first_sync.message}.`)
            window.dispatchEvent(new CustomEvent('assetadvisor:data-changed'))
            resolve()
          } catch (e) { reject(e) }
        },
        onExit: (err) => (err ? reject(new Error(err.display_message || err.error_message || 'Plaid closed')) : resolve()),
      }).open()
    })
  })
  const connectSnap = () => run('snaptrade', async () => {
    const r = await api.post('/api/brokers/snaptrade/portal', { portfolio_id: target })
    window.open(r.url, '_blank', 'noopener')
    setNotice('Finish connecting your broker in the SnapTrade window, then press "Sync now" on the new connection below.')
  })
  const sync = (c) => run(c.id, async () => {
    const r = await api.post(`/api/brokers/${c.id}/sync`, {})
    setNotice(r.ok ? `Synced: ${r.message}.` : r.message)
    window.dispatchEvent(new CustomEvent('assetadvisor:data-changed'))
  })
  const remove = (c) => {
    const del = window.confirm(`Disconnect ${c.label}?\n\nOK: also delete the trades and cash movements it imported.\nCancel: keep them (you'll be asked to confirm disconnecting).`)
    if (!del && !window.confirm(`Disconnect ${c.label} and keep its imported records?`)) return
    run(c.id, async () => { await api.del(`/api/brokers/${c.id}${del ? '?delete_imported=true' : ''}`); window.dispatchEvent(new CustomEvent('assetadvisor:data-changed')) })
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Broker connections <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>· {label}</span></h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 760 }}>
        Connect your brokerage once and AssetAdvisor imports trades, deposits, withdrawals, dividends and fees every 6 hours,
        without duplicates. Access is read-only: AssetAdvisor can't place orders or move money.
        Prefer files? <Link to="/csv-import">CSV import</Link> still works.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {notice && <p className="positive" role="status">{notice}</p>}
      {!data ? <LoadingSpinner /> : (
        <>
          <Card title="Connected">
            {data.connections.length === 0 ? <p className="muted" style={{ margin: 0 }}>No connections for this portfolio yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr>{['Connection', 'Last sync', 'Result', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.connections.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.label}</strong><div className="muted" style={{ fontSize: '0.75rem' }}>{PROVIDER[c.provider]}{c.meta?.paper ? ' · paper' : ''}</div></td>
                        <td className="muted">{c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'not yet'}</td>
                        <td className={c.last_sync_ok === false ? 'negative' : ''} style={{ fontSize: '0.85rem' }}>{c.last_sync_msg || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {data.can_write && <>
                            <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => sync(c)}>{busy === c.id ? 'Syncing…' : 'Sync now'}</button>
                            <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => remove(c)}>Disconnect</button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canWrite && data.can_write && (
            <>
              {combined && (
                <label style={{ ...field, marginTop: '1rem', maxWidth: 320 }}>Import into portfolio
                  <select className="input" value={target || ''} onChange={(e) => setBook(e.target.value)}>
                    {bookOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                <Card title="Alpaca">
                  <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
                    In Alpaca, create an API key (paper or live) and paste it here. Trades go into {targetName}.
                  </p>
                  <form onSubmit={connectAlpaca} style={{ display: 'grid', gap: 8 }}>
                    <label style={field}>API key ID<input className="input" required autoComplete="off" value={alp.key_id} onChange={(e) => setAlp({ ...alp, key_id: e.target.value })} /></label>
                    <label style={field}>Secret key<input className="input" required type="password" autoComplete="off" value={alp.secret_key} onChange={(e) => setAlp({ ...alp, secret_key: e.target.value })} /></label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                      <input type="checkbox" checked={alp.paper} onChange={(e) => setAlp({ ...alp, paper: e.target.checked })} /> Paper-trading account
                    </label>
                    <button className="btn" disabled={!!busy}>{busy === 'alpaca' ? 'Connecting…' : 'Connect Alpaca'}</button>
                  </form>
                </Card>
                <Card title="Most US brokers">
                  <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
                    Schwab, Fidelity, Vanguard, Robinhood, E*TRADE, Interactive Brokers and others, through a secure connection
                    service. You sign in at your broker; AssetAdvisor never sees your broker password.
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {data.configured.plaid && <button type="button" className="btn" disabled={!!busy} onClick={connectPlaid}>{busy === 'plaid' ? 'Opening…' : 'Connect with Plaid'}</button>}
                    {data.configured.snaptrade && <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={connectSnap}>{busy === 'snaptrade' ? 'Opening…' : 'Connect with SnapTrade'}</button>}
                    {!data.configured.plaid && !data.configured.snaptrade && (
                      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Coming soon: these connections aren't switched on yet.</p>
                    )}
                  </div>
                </Card>
              </div>
            </>
          )}
          {!canWrite && <p className="muted">You have view-only access to {selected?.name || 'this portfolio'}.</p>}
        </>
      )}
    </div>
  )
}
