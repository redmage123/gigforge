import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function OnchainPnL() {
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState('ethereum')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const chains = [
    { value: 'ethereum', label: 'Ethereum' },
    { value: 'bsc', label: 'BSC' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'arbitrum', label: 'Arbitrum' },
    { value: 'base', label: 'Base' },
  ]

  const selectStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '1rem',
  }

  const calculatePnL = async () => {
    if (!address.trim()) return
    setLoading(true)
    setError('')
    setData(null)
    try {
      const res = await api.get(`/api/onchain-pnl?address=${encodeURIComponent(address.trim())}&chain=${chain}`)
      setData(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatUsd = (val) => {
    if (val == null) return '--'
    const num = Number(val)
    const prefix = num >= 0 ? '+' : ''
    return `${prefix}$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const pnlColor = (val) => {
    if (val == null) return '#e2e8f0'
    return Number(val) >= 0 ? '#00d4aa' : '#ff6b6b'
  }

  const realized = data?.total_realized_pnl ?? data?.realized_pnl ?? null
  const unrealized = data?.total_unrealized_pnl ?? data?.unrealized_pnl ?? null
  const gasSpent = data?.total_gas_spent ?? data?.gas_spent ?? null
  const tokens = data?.tokens || data?.breakdown || []

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>On-Chain Profit & Loss</h2>

      <Card className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 250 }}>
            <label>Wallet Address</label>
            <input
              className="form-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="form-group">
            <label>Chain</label>
            <select className="form-input" value={chain} onChange={(e) => setChain(e.target.value)} style={selectStyle}>
              {chains.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={calculatePnL} disabled={loading || !address.trim()}>
            {loading ? 'Calculating...' : 'Calculate P&L'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && <LoadingSpinner />}

      {data && !loading && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <div className="card" style={{ flex: 1, minWidth: 200, padding: '1.25rem', borderLeft: `4px solid ${pnlColor(realized)}` }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Total Realized P&L</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: pnlColor(realized) }}>
                {formatUsd(realized)}
              </div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200, padding: '1.25rem', borderLeft: `4px solid ${pnlColor(unrealized)}` }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Total Unrealized P&L</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: pnlColor(unrealized) }}>
                {formatUsd(unrealized)}
              </div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 200, padding: '1.25rem', borderLeft: '4px solid #64748b' }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Total Gas Spent</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ff6b6b' }}>
                {gasSpent != null ? `$${Number(gasSpent).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '--'}
              </div>
            </div>
          </div>

          {tokens.length > 0 && (
            <Card title="Token Breakdown" className="mt-1">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a3d' }}>
                      {['Token', 'Bought', 'Sold', 'Avg Buy Price', 'Current Price', 'Realized P&L', 'Unrealized P&L'].map((h) => (
                        <th key={h} style={{ textAlign: h === 'Token' ? 'left' : 'right', padding: '0.75rem', color: '#64748b', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0', fontWeight: 600 }}>
                          {t.symbol || t.token || '--'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e2e8f0' }}>
                          {t.bought != null ? Number(t.bought).toLocaleString() : '--'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e2e8f0' }}>
                          {t.sold != null ? Number(t.sold).toLocaleString() : '--'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e2e8f0' }}>
                          {t.avg_buy_price != null ? `$${Number(t.avg_buy_price).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '--'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e2e8f0' }}>
                          {t.current_price != null ? `$${Number(t.current_price).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '--'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: pnlColor(t.realized_pnl), fontWeight: 600 }}>
                          {formatUsd(t.realized_pnl)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: pnlColor(t.unrealized_pnl), fontWeight: 600 }}>
                          {formatUsd(t.unrealized_pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
