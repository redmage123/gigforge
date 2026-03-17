import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

export default function TokenApprovals() {
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState('ethereum')
  const [approvals, setApprovals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState({})
  const [error, setError] = useState('')

  const chains = [
    { value: 'ethereum', label: 'Ethereum' },
    { value: 'bsc', label: 'BSC' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'arbitrum', label: 'Arbitrum' },
    { value: 'base', label: 'Base' },
  ]

  const scanApprovals = async () => {
    if (!address.trim()) return
    setLoading(true)
    setError('')
    setApprovals(null)
    try {
      const res = await api.get(`/api/approvals?address=${encodeURIComponent(address.trim())}&chain=${chain}`)
      setApprovals(Array.isArray(res) ? res : res.approvals || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const revokeApproval = async (approval, index) => {
    setRevoking((prev) => ({ ...prev, [index]: true }))
    try {
      await api.post('/api/approvals/revoke', {
        address: address.trim(),
        chain,
        token: approval.token_address || approval.token,
        spender: approval.spender_address || approval.spender,
      })
      setApprovals((prev) => prev.filter((_, i) => i !== index))
    } catch (err) {
      setError(err.message)
    } finally {
      setRevoking((prev) => ({ ...prev, [index]: false }))
    }
  }

  const truncate = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '--'

  const selectStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '1rem',
  }

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Token Approval Revocation</h2>

      <Card className="mt-1">
        <div style={{
          background: '#1a1400',
          border: '1px solid #ff6b6b55',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          color: '#ff6b6b',
          fontSize: '0.9rem',
        }}>
          Warning: Revoking requires a transaction. This generates unsigned tx data.
        </div>

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
          <button className="btn" onClick={scanApprovals} disabled={loading || !address.trim()}>
            {loading ? 'Scanning...' : 'Scan Approvals'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && <LoadingSpinner />}

      {approvals && !loading && (
        <Card title={`Approvals Found: ${approvals.length}`} className="mt-1">
          {approvals.length === 0 ? (
            <p className="muted">No active approvals found for this wallet on {chain}.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a3d' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Token</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Spender</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem', color: '#64748b' }}>Allowance</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', color: '#64748b' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                      <td style={{ padding: '0.75rem', color: '#e2e8f0' }}>
                        <div style={{ fontWeight: 600 }}>{a.token_name || a.token_symbol || 'Unknown'}</div>
                        <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {truncate(a.token_address || a.token)}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#e2e8f0' }}>
                        <div>{a.spender_name || 'Unknown Contract'}</div>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {truncate(a.spender_address || a.spender)}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e2e8f0' }}>
                        {a.allowance === 'unlimited' || a.allowance === 'Unlimited'
                          ? <span style={{ color: '#ff6b6b', fontWeight: 600 }}>Unlimited</span>
                          : (a.allowance || '--')}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <button
                          className="btn btn-danger"
                          onClick={() => revokeApproval(a, i)}
                          disabled={revoking[i]}
                          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                        >
                          {revoking[i] ? 'Revoking...' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
