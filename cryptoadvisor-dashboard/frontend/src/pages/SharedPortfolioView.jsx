import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClassBadge, classLabel, pct, tone, usd } from '../components/assetClass'

// Public, read-only view of a shared portfolio snapshot: /shared/<token>. No sign-in needed.
export default function SharedPortfolioView() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/share/view/${encodeURIComponent(token)}`, { credentials: 'omit' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || 'This share link could not be loaded')
        setData(body)
      })
      .catch((e) => setError(e.message || 'This share link could not be loaded'))
  }, [token])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>AssetAdvisor shared portfolio</div>
      {error && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Link unavailable</h2>
          <p className="muted" style={{ marginBottom: 0 }}>{error}</p>
        </div>
      )}
      {!data && !error && <div className="loading-spinner"><div className="spinner" /></div>}
      {data && (
        <>
          <h1 style={{ marginTop: 0 }}>{data.title}</h1>
          <p className="muted">
            Read-only snapshot taken {data.created_at ? new Date(data.created_at).toLocaleString() : 'when the link was created'}. It does not update.
          </p>

          {(data.show_values || data.show_returns) && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {data.show_values && (
                <div className="card" style={{ flex: 1, minWidth: 180 }}>
                  <div className="muted">Total value</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{usd(data.total_value)}</div>
                </div>
              )}
              {data.show_returns && (
                <div className="card" style={{ flex: 1, minWidth: 180 }}>
                  <div className="muted">Unrealized return</div>
                  <div className={tone(data.total_return_pct)} style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pct(data.total_return_pct)}</div>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Asset mix</h3>
            {data.allocation.map((a) => (
              <div key={a.asset_class} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0.35rem 0' }}>
                <span style={{ minWidth: 110 }}>{classLabel(a.asset_class)}</span>
                <div style={{ flex: 1, background: 'rgba(100,108,255,0.12)', borderRadius: 4, height: 10 }}>
                  <div style={{ width: `${Math.min(100, a.weight_pct)}%`, background: '#646cff', height: 10, borderRadius: 4 }} />
                </div>
                <span style={{ minWidth: 64, textAlign: 'right' }}>{Number(a.weight_pct).toFixed(2)}%</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Holdings</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Weight</th>
                    {data.show_values && <th>Value</th>}
                    {data.show_returns && <th>Return</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h, i) => (
                    <tr key={`${h.symbol}-${i}`}>
                      <td>
                        <ClassBadge cls={h.asset_class} /> <strong>{h.symbol}</strong>{' '}
                        <span className="muted">{h.name}</span>
                        {h.side === 'short' && <span className="badge badge-red" style={{ marginLeft: 6 }}>Short</span>}
                      </td>
                      <td>{Number(h.weight_pct).toFixed(2)}%</td>
                      {data.show_values && <td>{usd(h.value_usd)}</td>}
                      {data.show_returns && <td className={tone(h.return_pct)}>{pct(h.return_pct)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem' }}>For information only. Not investment advice.</p>
        </>
      )}
    </div>
  )
}
