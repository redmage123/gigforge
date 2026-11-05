import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import SmartAlertCreator from '../components/SmartAlertCreator'
import InstrumentPicker from '../components/InstrumentPicker'
import { ClassBadge, price as fmtPrice } from '../components/assetClass'

function Alerts() {
  const { data, loading, refetch } = useFetch('/api/alerts/')
  const [inst, setInst] = useState(null)
  const [quote, setQuote] = useState(null)
  const [direction, setDirection] = useState('above')
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const alerts = Array.isArray(data) ? data : data?.alerts || []
  const active = alerts.filter((a) => a.active)
  const fired = alerts.filter((a) => !a.active && a.triggered_at).sort((a, b) => b.triggered_at - a.triggered_at)

  // Show the current price so the target is set relative to it
  useEffect(() => {
    setQuote(null)
    if (!inst) return
    api.get(`/api/instruments/quotes?ids=${encodeURIComponent(inst.id)}`).then((r) => setQuote(r.quotes?.[inst.id] || null)).catch(() => {})
  }, [inst])

  const createAlert = async (e) => {
    e.preventDefault()
    if (!inst || !target) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/alerts/', { instrument_id: inst.id, direction, target_price: parseFloat(target) })
      setTarget('')
      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteAlert = async (id) => {
    try {
      await api.del(`/api/alerts/${id}`)
      refetch()
    } catch (err) {
      setError(err.message)
    }
  }

  const isRate = inst?.asset_class === 'rate'
  return (
    <div>
      <h1>Price Alerts</h1>

      <Card title="Create Alert" className="mt-1">
        <form onSubmit={createAlert} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            <label htmlFor="alert-instrument">Instrument</label>
            <InstrumentPicker id="alert-instrument" value={inst} onChange={setInst} tradableOnly={false} />
            {inst && quote && (
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Now {fmtPrice(quote.price, inst.price_decimals)}{isRate ? '%' : ''}{quote.delayed ? ' (delayed ~15 min)' : ''}
              </span>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="alert-direction">Condition</label>
            <select id="alert-direction" className="input" value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="above">{isRate ? 'Yield' : 'Price'} rises to or above</option>
              <option value="below">{isRate ? 'Yield' : 'Price'} falls to or below</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="alert-target">{isRate ? 'Yield (%)' : 'Price ($)'}</label>
            <input id="alert-target" className="input" type="number" step="any" min="0" value={target}
              onChange={(e) => setTarget(e.target.value)} placeholder={quote ? String(quote.price) : '0.00'} required />
          </div>
          <button type="submit" className="btn" disabled={saving || !inst}>{saving ? 'Creating…' : 'Create Alert'}</button>
        </form>
        {error && <p className="negative" style={{ marginTop: '0.75rem' }}>{error}</p>}
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>Checked every minute. Triggered alerts appear under Notifications.</p>
      </Card>

      <div className="mt-1"><SmartAlertCreator onSaved={refetch} /></div>

      <Card title={`Active alerts (${active.length})`} className="mt-1">
        {loading ? <LoadingSpinner /> : active.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {active.map((a) => (
              <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <ClassBadge cls={a.asset_class} />
                  <Link to={`/i/${encodeURIComponent(a.instrument_id)}`}><strong>{a.symbol}</strong></Link>
                  <span className="muted">{a.name}</span>
                  <span>{a.direction === 'above' ? '≥' : '≤'} <strong>{fmtPrice(a.target_price)}</strong></span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => deleteAlert(a.id)} aria-label={`Delete alert on ${a.symbol}`}>Delete</button>
              </div>
            ))}
          </div>
        ) : <p className="muted">No active alerts.</p>}
      </Card>

      {fired.length > 0 && (
        <Card title="Triggered" className="mt-1">
          {fired.slice(0, 20).map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.35rem 0', flexWrap: 'wrap' }}>
              <ClassBadge cls={a.asset_class} /> <strong>{a.symbol}</strong>
              <span className="muted">{a.direction === 'above' ? '≥' : '≤'} {fmtPrice(a.target_price)}, hit at {fmtPrice(a.triggered_price)} on {new Date(a.triggered_at * 1000).toLocaleString()}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => deleteAlert(a.id)}>Remove</button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

export default Alerts
