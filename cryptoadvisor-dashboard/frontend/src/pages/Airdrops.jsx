import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const criteriaConfig = {
  transaction_count: { label: 'Transaction Count', icon: 'Txns' },
  unique_contracts: { label: 'Unique Contracts', icon: 'Contracts' },
  bridge_usage: { label: 'Bridge Usage', icon: 'Bridge' },
  defi_activity: { label: 'DeFi Activity', icon: 'DeFi' },
  nft_activity: { label: 'NFT Activity', icon: 'NFTs' },
  wallet_age: { label: 'Wallet Age', icon: 'Age' },
}

export default function Airdrops() {
  const [address, setAddress] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const checkEligibility = async () => {
    if (!address.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.get(`/api/airdrops/check?address=${encodeURIComponent(address.trim())}`)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const score = result?.overall_score ?? result?.score ?? 0
  const criteria = result?.criteria || result?.details || []

  const getScoreColor = (s) => {
    if (s >= 80) return '#00d4aa'
    if (s >= 60) return '#4ade80'
    if (s >= 40) return '#facc15'
    if (s >= 20) return '#fb923c'
    return '#ff6b6b'
  }

  const gaugeSize = 180
  const strokeWidth = 14
  const radius = (gaugeSize - strokeWidth) / 2
  const circumference = Math.PI * radius
  const scoreOffset = circumference - (score / 100) * circumference

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Airdrop Eligibility Checker</h2>

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
          <button className="btn" onClick={checkEligibility} disabled={loading || !address.trim()}>
            {loading ? 'Checking...' : 'Check Eligibility'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && <LoadingSpinner />}

      {result && !loading && (
        <>
          <Card title="Overall Eligibility Score" className="mt-1">
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <div style={{ position: 'relative', width: gaugeSize, height: gaugeSize / 2 + 20 }}>
                <svg width={gaugeSize} height={gaugeSize / 2 + 10} viewBox={`0 0 ${gaugeSize} ${gaugeSize / 2 + 10}`}>
                  {/* Background arc */}
                  <path
                    d={`M ${strokeWidth / 2} ${gaugeSize / 2} A ${radius} ${radius} 0 0 1 ${gaugeSize - strokeWidth / 2} ${gaugeSize / 2}`}
                    fill="none"
                    stroke="#2a2a3d"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                  {/* Score arc */}
                  <path
                    d={`M ${strokeWidth / 2} ${gaugeSize / 2} A ${radius} ${radius} 0 0 1 ${gaugeSize - strokeWidth / 2} ${gaugeSize / 2}`}
                    fill="none"
                    stroke={getScoreColor(score)}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={scoreOffset}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 700, color: getScoreColor(score) }}>{score}</div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>out of 100</div>
                </div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {criteria.map((c, i) => {
              const config = criteriaConfig[c.key || c.name] || { label: c.name || c.key || `Criterion ${i + 1}`, icon: '?' }
              const met = c.met ?? c.passed ?? c.eligible ?? false
              const cScore = c.score ?? c.value ?? 0
              const maxScore = c.max_score ?? c.max ?? 100

              return (
                <div key={i} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0, color: '#e2e8f0' }}>{config.label}</h4>
                    <span style={{
                      padding: '0.2rem 0.7rem',
                      borderRadius: 12,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: met ? '#00d4aa22' : '#ff6b6b22',
                      color: met ? '#00d4aa' : '#ff6b6b',
                    }}>
                      {met ? 'Met' : 'Not Met'}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>Score</span>
                      <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{cScore} / {maxScore}</span>
                    </div>
                    <div style={{ background: '#1a1a2e', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min((cScore / maxScore) * 100, 100)}%`,
                        height: '100%',
                        background: met ? '#00d4aa' : '#ff6b6b',
                        borderRadius: 4,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>

                  {(c.details || c.description) && (
                    <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                      {c.details || c.description}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
