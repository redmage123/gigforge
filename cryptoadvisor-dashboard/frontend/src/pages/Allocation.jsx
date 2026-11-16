import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { usePortfolios } from '../hooks/usePortfolios'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import InstrumentPicker from '../components/InstrumentPicker'
import { ASSET_CLASSES, classLabel, usd } from '../components/assetClass'

function TargetEditor({ analysis, onSaved }) {
  const [style, setStyle] = useState(analysis.style || 'instrument')
  const [rows, setRows] = useState(analysis.targets.map((t) => ({ ...t, label: t.key })))
  const [threshold, setThreshold] = useState(analysis.threshold)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const total = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0)
  const switchStyle = (v) => { setStyle(v); setRows([]) }
  const save = async () => {
    setBusy(true); setError('')
    try {
      onSaved(await api.put('/api/portfolios/allocation', {
        targets: rows.filter((r) => r.key).map((r) => ({ key: r.key, weight: parseFloat(r.weight) || 0 })),
        drift_threshold: parseFloat(threshold),
      }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Card title="Targets">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div role="radiogroup" aria-label="Target style" style={{ display: 'flex', gap: 4 }}>
          {[['instrument', 'By instrument'], ['class', 'By asset class']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={style === v} className={`btn btn-sm ${style === v ? '' : 'btn-ghost'}`} onClick={() => switchStyle(v)}>{l}</button>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
          Alert when off by more than
          <input className="input" type="number" min="0.5" max="50" step="0.5" value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ minWidth: 0, width: 70 }} />
          points
        </label>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            {style === 'class' ? (
              <select className="input" aria-label="Asset class" value={r.key.replace('class:', '')} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, key: `class:${e.target.value}` } : x))}>
                <option value="">Choose…</option>
                {ASSET_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            ) : r.key ? <strong>{r.label}</strong> : (
              <InstrumentPicker value={null} onChange={(inst) => inst && setRows(rows.map((x, j) => j === i ? { ...x, key: inst.id, label: `${inst.symbol} (${inst.name})` } : x))} />
            )}
          </div>
          <label className="sr-only" htmlFor={`w-${i}`}>Target weight</label>
          <input id={`w-${i}`} className="input" type="number" min="0" max="100" step="0.5" value={r.weight} style={{ minWidth: 0, width: 90 }}
            onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, weight: e.target.value } : x))} />%
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove target">Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows([...rows, { key: style === 'class' ? 'class:' : '', weight: '' }])}>Add target</button>
        <span className={total > 100 ? 'negative' : 'muted'} style={{ fontSize: '0.85rem' }}>
          {total.toFixed(1)}% allocated · {Math.max(0, 100 - total).toFixed(1)}% cash target
        </span>
        <button type="button" className="btn" disabled={busy || total > 100} onClick={save}>{busy ? 'Saving…' : 'Save targets'}</button>
      </div>
      {error && <p className="negative" role="alert">{error}</p>}
    </Card>
  )
}

export default function Allocation() {
  const { label, combined, canWrite, current } = usePortfolios()
  const [a, setA] = useState(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState({})
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setError(''); setResult('')
    api.get('/api/portfolios/allocation').then((r) => { setA(r); setPicked(Object.fromEntries((r.orders || []).map((o) => [o.instrument_id, true]))) })
      .catch((e) => setError(e.message))
  }
  useEffect(() => { if (!combined) { setA(null); load() } }, [current, combined])

  const logOrders = async () => {
    const orders = a.orders.filter((o) => picked[o.instrument_id])
    if (!orders.length) return
    if (!window.confirm(`Log ${orders.length} trade(s) in ${label} at the current market price? This records them in the journal; it doesn't place orders with a broker.`)) return
    setBusy(true)
    try {
      const r = await api.post('/api/portfolios/allocation/log-orders', { orders })
      setResult(`Logged ${r.logged} trade(s).`)
      window.dispatchEvent(new CustomEvent('assetadvisor:data-changed'))
      load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (combined) {
    return (
      <div>
        <h1>Allocation</h1>
        <Card><p className="muted" style={{ margin: 0 }}>Targets are set per portfolio. Pick one in the switcher at the top.</p></Card>
      </div>
    )
  }
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Allocation <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>· {label}</span></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Set target weights, see how far the portfolio has drifted, and get the trades that would bring it back. You get a
        notification when anything drifts past your threshold.
      </p>
      {error && <p className="negative" role="alert">{error}</p>}
      {!a ? <LoadingSpinner /> : (
        <>
          {a.error && <Card><p className="negative" style={{ margin: 0 }}>{a.error} <Link to="/performance">Go to Performance</Link></p></Card>}
          {!a.error && a.rows.length > 0 && (
            <Card title={`Current vs target (value ${usd(a.nav)})`}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr>{['', 'Target', 'Current', 'Drift', 'Value', 'Target value'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {a.rows.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <strong>{a.style === 'class' && r.key !== 'cash' ? classLabel(r.symbol) : r.symbol}</strong>
                          {r.untargeted && <span className="muted" style={{ fontSize: '0.75rem' }}> (no target)</span>}
                          {r.note && <div className="muted" style={{ fontSize: '0.75rem' }}>{r.note}</div>}
                        </td>
                        <td>{r.target_pct.toFixed(1)}%</td>
                        <td>{r.current_pct.toFixed(1)}%</td>
                        <td className={r.breach ? 'negative' : 'muted'}><strong>{r.drift_pct > 0 ? '+' : ''}{r.drift_pct.toFixed(1)} pts</strong>{r.breach ? ' ⚠' : ''}</td>
                        <td>{usd(r.value)}</td>
                        <td className="muted">{usd(r.target_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
                {a.breaches ? `${a.breaches} allocation(s) outside ±${a.threshold} points.` : `Everything is within ±${a.threshold} points.`}
                {' '}Weights are a share of the portfolio's value including cash; futures count at their full contract value.
              </p>
            </Card>
          )}
          {!a.error && a.orders?.length > 0 && (
            <Card title="Trades to rebalance" style={{ marginTop: '1rem' }}>
              <table className="data-table">
                <thead><tr>{['', 'Instrument', 'Side', 'Quantity', 'Price', 'Value'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {a.orders.map((o) => (
                    <tr key={o.instrument_id}>
                      <td>{canWrite && <input type="checkbox" aria-label={`Include ${o.symbol}`} checked={!!picked[o.instrument_id]} onChange={(e) => setPicked({ ...picked, [o.instrument_id]: e.target.checked })} />}</td>
                      <td><strong>{o.symbol}</strong></td>
                      <td><span className={`badge ${o.side === 'buy' ? 'badge-green' : 'badge-red'}`}>{o.side.toUpperCase()}</span></td>
                      <td>{o.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td>{o.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td>{usd(o.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Rounded to whole shares and contracts at the latest price (stocks and futures about 15 minutes delayed).
                Place the orders with your broker; logging them here keeps the journal in step.
              </p>
              {canWrite && <button type="button" className="btn" disabled={busy} onClick={logOrders}>{busy ? 'Logging…' : 'Log selected trades'}</button>}
              {result && <span className="positive" style={{ marginLeft: 8 }}>{result}</span>}
            </Card>
          )}
          {(a.notes || []).map((n) => <p key={n} className="muted" style={{ fontSize: '0.8rem' }}>{n}</p>)}
          {canWrite && <div style={{ marginTop: '1rem' }}><TargetEditor key={JSON.stringify(a.targets)} analysis={a} onSaved={(r) => { setA(r); setPicked(Object.fromEntries((r.orders || []).map((o) => [o.instrument_id, true]))) }} /></div>}
        </>
      )}
    </div>
  )
}
