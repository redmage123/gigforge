import { useState } from 'react'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'

const CHAINS = ['ethereum', 'solana', 'bitcoin']

function Blockchain() {
  const [chain, setChain] = useState('ethereum')
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState('')

  const { data: network, loading: nl } = useFetch(`/api/blockchain/${chain}/network`)
  const { data: gasComparison, loading: gl } = useFetch('/api/blockchain/gas-comparison')

  const lookupBalance = async (e) => {
    e.preventDefault()
    if (!address.trim()) return
    setBalanceLoading(true)
    setBalanceError('')
    setBalance(null)
    try {
      const res = await api.get(`/api/blockchain/${chain}/balance/${address.trim()}`)
      setBalance(res)
    } catch (err) {
      setBalanceError(err.message)
    } finally {
      setBalanceLoading(false)
    }
  }

  const net = network || {}

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Blockchain Explorer</h1>
        <select className="form-input" value={chain} onChange={(e) => setChain(e.target.value)}>
          {CHAINS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {nl ? <LoadingSpinner /> : (
        <div className="grid-row">
          <StatCard label="Block Height" value={net.block_height?.toLocaleString() || net.blockHeight?.toLocaleString() || '--'} />
          <StatCard label="TPS" value={net.tps ?? net.transactions_per_second ?? '--'} />
          <StatCard label="Active Validators" value={net.active_validators?.toLocaleString() || net.validators?.toLocaleString() || '--'} />
          <StatCard label="Gas Price" value={net.gas_price || net.gasPrice || '--'} />
        </div>
      )}

      <Card title="Address Lookup" className="mt-1">
        <form onSubmit={lookupBalance} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={`Enter ${chain} address...`}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn" disabled={balanceLoading}>
            {balanceLoading ? 'Looking up...' : 'Lookup'}
          </button>
        </form>
        {balanceError && <p className="negative" style={{ marginTop: '0.75rem' }}>{balanceError}</p>}
        {balance && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="muted">Balance</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {balance.balance ?? balance.amount ?? JSON.stringify(balance)}
            </div>
            {balance.usd_value && <div className="muted">${Number(balance.usd_value).toLocaleString()}</div>}
          </div>
        )}
      </Card>

      <Card title="Gas Comparison Across Chains" className="mt-1">
        {gl ? <LoadingSpinner /> : gasComparison ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {['Chain', 'Low', 'Average', 'High', 'Unit'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(gasComparison) ? gasComparison : Object.entries(gasComparison).map(([k, v]) => ({ chain: k, ...v }))).map((row, i) => (
                  <tr key={i}>
                    <td>{row.chain || row.name}</td>
                    <td className="positive">{row.low ?? '--'}</td>
                    <td style={{ color: '#facc15' }}>{row.average ?? row.avg ?? '--'}</td>
                    <td className="negative">{row.high ?? '--'}</td>
                    <td className="muted">{row.unit ?? 'gwei'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No gas comparison data available.</p>}
      </Card>
    </div>
  )
}

export default Blockchain
