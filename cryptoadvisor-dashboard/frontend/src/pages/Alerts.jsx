import { useState } from 'react'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import SmartAlertCreator from '../components/SmartAlertCreator'

function Alerts() {
  const { data, loading, refetch } = useFetch('/api/alerts')
  const [coin, setCoin] = useState('bitcoin')
  const [condition, setCondition] = useState('above')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const alerts = data ? (Array.isArray(data) ? data : data.alerts || []) : []

  const createAlert = async (e) => {
    e.preventDefault()
    if (!price) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/alerts', { coin, condition, price: parseFloat(price) })
      setPrice('')
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

  return (
    <div>
      <h1>Price Alerts</h1>

      <Card title="Create Alert" className="mt-1">
        <form onSubmit={createAlert} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Coin</label>
            <select className="form-input" value={coin} onChange={(e) => setCoin(e.target.value)}>
              {['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'dogecoin'].map((c) => (
                <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Condition</label>
            <select className="form-input" value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="above">Price Above</option>
              <option value="below">Price Below</option>
            </select>
          </div>
          <div className="form-group">
            <label>Price ($)</label>
            <input className="form-input" type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
          </div>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Creating...' : 'Create Alert'}</button>
        </form>
        {error && <p className="negative" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      <SmartAlertCreator />

      <Card title="Active Alerts" className="mt-1">
        {loading ? <LoadingSpinner /> : alerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {alerts.map((a) => (
              <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{(a.coin || '').replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</strong>
                  <span className="muted" style={{ margin: '0 0.5rem' }}>
                    {a.condition === 'above' ? '>' : '<'}
                  </span>
                  <strong>${Number(a.price).toLocaleString()}</strong>
                </div>
                <button className="btn btn-danger" onClick={() => deleteAlert(a.id)}>Delete</button>
              </div>
            ))}
          </div>
        ) : <p className="muted">No active alerts.</p>}
      </Card>
    </div>
  )
}

export default Alerts
