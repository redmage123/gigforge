import { useEffect, useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { usd } from '../components/assetClass'

const EVM_RE = /^0x[a-fA-F0-9]{40}$/
const amt = (v) => (v == null ? '--' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 }))
const signed = (v) => (v == null ? '--' : `${v > 0 ? '+' : ''}${amt(v)}`)
const flowClass = (v) => (!v ? '' : v > 0 ? 'positive' : 'negative')

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 200, padding: '1.25rem' }}>
      <div className="muted" style={{ marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function OnchainPnL() {
  const [address, setAddress] = useState('')
  const [saved, setSaved] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // EVM wallets saved under Crypto Wallets (an EVM address is the same on every EVM chain)
  useEffect(() => {
    api.get('/api/wallet/saved').then((res) => {
      const list = (Array.isArray(res) ? res : []).filter((w) => EVM_RE.test(w.address || ''))
      const seen = new Set()
      setSaved(list.filter((w) => { const k = w.address.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }))
    }).catch(() => setSaved([]))
  }, [])

  const analyze = async () => {
    const a = address.trim()
    if (!EVM_RE.test(a)) { setError('Enter an Ethereum address: 0x followed by 40 hex characters.'); return }
    setLoading(true)
    setError('')
    setData(null)
    try {
      setData(await api.get(`/api/onchain-pnl/?address=${encodeURIComponent(a)}&chain=ethereum`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>On-Chain Activity and Value</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Ethereum mainnet: what an address received and sent per token, what it holds now and what that is worth today,
        and how much it paid in gas. Profit and loss needs the price paid for each token, which free on-chain data
        does not include, so this page does not show it.
      </p>

      <Card className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {saved.length > 0 && (
            <div className="form-group">
              <label htmlFor="pnl-saved">Saved wallet</label>
              <select id="pnl-saved" className="form-input" value="" onChange={(e) => e.target.value && setAddress(e.target.value)}>
                <option value="">Choose...</option>
                {saved.map((w) => <option key={w.address} value={w.address}>{w.label || 'Wallet'} ({w.address.slice(0, 6)}...{w.address.slice(-4)})</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ flex: 1, minWidth: 250 }}>
            <label htmlFor="pnl-address">Ethereum address</label>
            <input id="pnl-address" className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x..." />
          </div>
          <button className="btn" onClick={analyze} disabled={loading || !address.trim()}>
            {loading ? 'Reading the chain...' : 'Analyze'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}
      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <Stat label="Value now" value={usd(data.total_value_usd)}
              sub={`ETH ${usd(data.eth.value_usd)} + tokens ${usd(data.tokens_value_usd)}${data.unpriced_tokens ? `, ${data.unpriced_tokens} unpriced` : ''}`} />
            <Stat label="Gas spent" value={`${amt(data.gas.eth)} ETH`}
              sub={`${usd(data.gas.usd_at_tx_time)} at the time, ${usd(data.gas.usd_at_today)} at today's price. ${data.gas.transactions_paid} transactions.`} />
            <Stat label="ETH net flow" value={`${signed(data.eth.net_flow)} ETH`}
              sub={`Received ${amt(data.eth.received)}, sent ${amt(data.eth.sent)}. Balance ${amt(data.eth.balance)} ETH.`} />
          </div>

          <Card title="Tokens" className="mt-1">
            {data.tokens.length === 0 ? <p className="muted">No ERC-20 activity found.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>{['Token', 'Received', 'Sent', 'Net flow', 'Balance now', 'Price now', 'Value now'].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.tokens.map((t) => (
                      <tr key={t.contract}>
                        <td><strong>{t.symbol}</strong> <span className="muted">{t.name}</span></td>
                        <td>{amt(t.received)}</td>
                        <td>{amt(t.sent)}</td>
                        <td className={flowClass(t.net_flow)}>{signed(t.net_flow)}</td>
                        <td>{amt(t.balance)}</td>
                        <td>{t.price == null ? 'no price' : `$${Number(t.price).toLocaleString(undefined, { maximumFractionDigits: 6 })}`}</td>
                        <td>{t.value_usd == null ? '--' : usd(t.value_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="How these numbers are made" className="mt-1">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {data.notes.map((n) => <li key={n} className="muted" style={{ fontSize: '0.85rem', marginBottom: 4 }}>{n}</li>)}
            </ul>
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
              Source: {data.source}. Read {data.transactions_read} transactions and {data.transfers_read} token transfers
              {data.last_activity ? `; latest activity ${new Date(data.last_activity).toLocaleDateString()}` : ''}.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
