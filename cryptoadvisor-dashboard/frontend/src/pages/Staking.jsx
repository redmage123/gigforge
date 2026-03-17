import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const protocols = [
  { key: 'lido', name: 'Lido stETH', color: '#00a3ff', chain: 'ETH' },
  { key: 'rocketpool', name: 'Rocket Pool rETH', color: '#ff6347', chain: 'ETH' },
  { key: 'coinbase', name: 'Coinbase cbETH', color: '#0052ff', chain: 'ETH' },
  { key: 'solana', name: 'SOL Staking', color: '#9945ff', chain: 'SOL' },
]

export default function Staking() {
  const [address, setAddress] = useState('')
  const [stakingData, setStakingData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const checkStaking = async () => {
    if (!address.trim()) return
    setLoading(true)
    setError('')
    setStakingData(null)
    try {
      const res = await api.get(`/api/staking?address=${encodeURIComponent(address.trim())}`)
      setStakingData(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getProtocolData = (key) => {
    if (!stakingData) return null
    if (stakingData.positions) {
      return stakingData.positions.find((p) => p.protocol === key || p.key === key)
    }
    return stakingData[key] || null
  }

  const formatUsd = (val) => {
    if (val == null) return '--'
    return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Staking Rewards Tracker</h2>

      <Card className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 250 }}>
            <label>Wallet Address</label>
            <input
              className="form-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x... or SOL address"
            />
          </div>
          <button className="btn" onClick={checkStaking} disabled={loading || !address.trim()}>
            {loading ? 'Checking...' : 'Check Staking'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && <LoadingSpinner />}

      {stakingData && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {protocols.map((proto) => {
            const data = getProtocolData(proto.key)
            const staked = data?.amount_staked ?? data?.staked ?? 0
            const apy = data?.apy ?? data?.estimated_apy ?? null
            const dailyReward = data?.daily_reward ?? (staked && apy ? (staked * (apy / 100) / 365) : null)
            const monthlyReward = data?.monthly_reward ?? (dailyReward ? dailyReward * 30 : null)
            const usdValue = data?.usd_value ?? null

            return (
              <div
                key={proto.key}
                className="card"
                style={{ borderLeft: `4px solid ${proto.color}`, padding: '1.25rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#e2e8f0' }}>{proto.name}</h3>
                  <span style={{
                    background: `${proto.color}22`,
                    color: proto.color,
                    padding: '0.2rem 0.6rem',
                    borderRadius: 12,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}>
                    {proto.chain}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Amount Staked</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                      {staked > 0 ? Number(staked).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'}
                    </span>
                  </div>
                  {usdValue != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">USD Value</span>
                      <span style={{ color: '#00d4aa', fontWeight: 600 }}>{formatUsd(usdValue)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Estimated APY</span>
                    <span style={{ color: '#00d4aa', fontWeight: 600 }}>
                      {apy != null ? `${Number(apy).toFixed(2)}%` : '--'}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid #2a2a3d', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span className="muted">Daily Reward</span>
                      <span style={{ color: '#e2e8f0' }}>
                        {dailyReward != null ? Number(dailyReward).toFixed(6) : '--'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Monthly Reward</span>
                      <span style={{ color: '#e2e8f0' }}>
                        {monthlyReward != null ? Number(monthlyReward).toFixed(6) : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
