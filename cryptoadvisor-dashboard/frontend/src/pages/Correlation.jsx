import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'

const availableCoins = [
  { id: 'bitcoin', label: 'Bitcoin' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'solana', label: 'Solana' },
  { id: 'cardano', label: 'Cardano' },
  { id: 'polkadot', label: 'Polkadot' },
  { id: 'avalanche-2', label: 'Avalanche' },
  { id: 'chainlink', label: 'Chainlink' },
  { id: 'uniswap', label: 'Uniswap' },
]

const dayOptions = [30, 60, 90, 180, 365]

export default function Correlation() {
  const [selectedCoins, setSelectedCoins] = useState(['bitcoin', 'ethereum', 'solana'])
  const [days, setDays] = useState(90)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)

  const toggleCoin = (id) => {
    setSelectedCoins((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const generate = async () => {
    if (selectedCoins.length < 2) {
      setError('Select at least 2 coins.')
      return
    }
    setLoading(true)
    setError('')
    setData(null)
    setProgress({ percent: 0, message: 'Starting...' })

    try {
      const params = `coins=${selectedCoins.join(',')}&days=${days}`
      const response = await fetch(`/api/correlation/stream?${params}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'result') {
                setData(parsed)
                setProgress(null)
              } else {
                setProgress({
                  percent: parsed.percent || 0,
                  message: parsed.message || 'Processing...',
                  step: parsed.step,
                  total: parsed.total,
                })
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      // Fallback to regular API if SSE fails
      try {
        const res = await api.get(`/api/correlation?coins=${selectedCoins.join(',')}&days=${days}`)
        setData(res)
      } catch (fallbackErr) {
        setError(fallbackErr.message || err.message)
      }
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const matrix = data?.matrix || data?.correlation_matrix || []
  const coins = data?.coins || data?.labels || selectedCoins
  const stats = data?.stats || data?.coin_stats || []

  const getCellColor = (val) => {
    if (val == null) return 'transparent'
    const v = Number(val)
    if (v >= 0.8) return '#00d4aa'
    if (v >= 0.5) return '#00d4aa99'
    if (v >= 0.2) return '#00d4aa44'
    if (v > -0.2) return '#64748b33'
    if (v > -0.5) return '#ff6b6b44'
    if (v > -0.8) return '#ff6b6b99'
    return '#ff6b6b'
  }

  const getCellTextColor = (val) => {
    const v = Math.abs(Number(val))
    return v >= 0.6 ? '#fff' : '#e2e8f0'
  }

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
      <h2 style={{ color: '#e0e0e0' }}>Portfolio Correlation Matrix</h2>

      <Card title="Select Coins" className="mt-1">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {availableCoins.map((coin) => (
            <label
              key={coin.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.8rem',
                background: selectedCoins.includes(coin.id) ? '#00d4aa22' : '#12121f',
                border: `1px solid ${selectedCoins.includes(coin.id) ? '#00d4aa' : '#2a2a3d'}`,
                borderRadius: 8,
                cursor: 'pointer',
                color: selectedCoins.includes(coin.id) ? '#00d4aa' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="checkbox"
                checked={selectedCoins.includes(coin.id)}
                onChange={() => toggleCoin(coin.id)}
                style={{ display: 'none' }}
              />
              {coin.label}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Time Period</label>
            <select className="form-input" value={days} onChange={(e) => setDays(Number(e.target.value))} style={selectStyle}>
              {dayOptions.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={generate} disabled={loading || selectedCoins.length < 2}>
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {progress && (
        <Card className="mt-1">
          <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{progress.message}</span>
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{progress.percent}%</span>
          </div>
          <div style={{
            width: '100%',
            height: 8,
            background: '#1a1a2e',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress.percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }} />
          </div>
          {progress.step != null && progress.total != null && (
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
              Step {progress.step + 1} of {progress.total}
            </div>
          )}
        </Card>
      )}

      {data && !loading && (
        <>
          {Array.isArray(matrix) && matrix.length > 0 && (
            <Card title="Correlation Matrix" className="mt-1">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.6rem', color: '#64748b' }}></th>
                      {coins.map((c) => (
                        <th key={c} style={{ padding: '0.6rem', color: '#e2e8f0', fontSize: '0.85rem', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ padding: '0.6rem', color: '#e2e8f0', fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {coins[ri] || `Coin ${ri}`}
                        </td>
                        {(Array.isArray(row) ? row : Object.values(row)).map((val, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: '0.6rem',
                              textAlign: 'center',
                              background: getCellColor(val),
                              color: getCellTextColor(val),
                              fontWeight: 600,
                              fontSize: '0.9rem',
                              borderRadius: 4,
                              minWidth: 60,
                            }}
                          >
                            {val != null ? Number(val).toFixed(2) : '--'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: 16, height: 16, background: '#00d4aa', borderRadius: 3 }} />
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Strong Positive</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: 16, height: 16, background: '#64748b33', borderRadius: 3 }} />
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Neutral</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: 16, height: 16, background: '#ff6b6b', borderRadius: 3 }} />
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Strong Negative</span>
                </div>
              </div>
            </Card>
          )}

          {stats.length > 0 && (
            <Card title="Coin Statistics" className="mt-1">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a3d' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#64748b' }}>Coin</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#64748b' }}>Volatility</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#64748b' }}>Mean Daily Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0', fontWeight: 600, textTransform: 'capitalize' }}>
                          {s.coin || s.name || coins[i]}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#facc15' }}>
                          {s.volatility != null ? `${(Number(s.volatility) * 100).toFixed(2)}%` : '--'}
                        </td>
                        <td style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          color: s.mean_daily_return >= 0 ? '#00d4aa' : '#ff6b6b',
                        }}>
                          {s.mean_daily_return != null ? `${(Number(s.mean_daily_return) * 100).toFixed(4)}%` : '--'}
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
