import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import AiAnalysisButton from '../components/AiAnalysisButton'
import AiInsightPanel from '../components/AiInsightPanel'
import InstrumentPicker from '../components/InstrumentPicker'
import { ClassBadge, price as fmtPrice, usd, tone } from '../components/assetClass'

const today = () => new Date().toISOString().split('T')[0]

export default function Trades() {
  const { data, loading, refetch } = useFetch('/api/trades/')
  const { data: pf, refetch: refetchPf } = useFetch('/api/trades/portfolio')
  const [params] = useSearchParams()
  const [inst, setInst] = useState(null)
  const [side, setSide] = useState('buy')
  const [quantity, setQuantity] = useState('')
  const [tradePrice, setTradePrice] = useState('')
  const [fee, setFee] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)

  // "Log trade" links from an instrument page arrive as /trades?instrument=stock:AAPL
  useEffect(() => {
    const id = params.get('instrument')
    if (id && !inst) api.get(`/api/instruments/${encodeURIComponent(id)}`).then(setInst).catch(() => {})
  }, [params])

  const trades = Array.isArray(data) ? data : []
  const totals = pf?.totals

  const useMarketPrice = async () => {
    if (!inst) return
    try {
      const res = await api.get(`/api/instruments/quotes?ids=${encodeURIComponent(inst.id)}`)
      const q = res.quotes?.[inst.id]
      if (q) setTradePrice(String(q.price))
      else setError(`No live price for ${inst.symbol} right now`)
    } catch (err) {
      setError(err.message)
    }
  }

  const addTrade = async (e) => {
    e.preventDefault()
    if (!inst) { setError('Pick an instrument first'); return }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.post('/api/trades/', {
        instrument_id: inst.id, side, quantity: parseFloat(quantity), price: parseFloat(tradePrice),
        fee: fee ? parseFloat(fee) : 0, date,
      })
      setNotice(`Logged: ${side} ${quantity} ${inst.symbol} @ ${tradePrice}`)
      setQuantity('')
      setTradePrice('')
      setFee('')
      refetch()
      refetchPf()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTrade = async (t) => {
    try {
      await api.del(`/api/trades/${t.id}`)
      refetch()
      refetchPf()
    } catch (err) {
      setError(err.message)
    }
  }

  const futures = inst && inst.multiplier && inst.multiplier !== 1
  const unit = inst?.asset_class === 'stock' || inst?.asset_class === 'etf' ? 'shares' : futures ? 'contracts'
    : inst?.asset_class === 'fx' ? `${inst.symbol.slice(0, 3)}, 100,000 = 1 lot` : 'units'
  const priceUnit = inst?.asset_class === 'fx' ? `${inst.currency} per ${inst.symbol.slice(0, 3)}`
    : inst?.currency && inst.currency !== 'USD' ? inst.currency : '$'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Trade Journal</h2>
        <AiAnalysisButton endpoint="/api/ai/trades/analyze" body={{}} label="Analyze My Trades" onResult={(text) => setAiInsight(text)} />
        <AiAnalysisButton endpoint="/api/ai/trades/suggest" body={{}} label="Get Trade Suggestions" onResult={(text) => setAiInsight(text)} />
      </div>

      <AiInsightPanel
        title="Trade AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true)
          api.post('/api/ai/trades/analyze', {})
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false))
        }}
        onClose={() => setAiInsight(null)}
      />

      <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
        <StatCard value={usd(totals?.total_pnl, { sign: true })} label="Total P&L" />
        <StatCard value={usd(totals?.unrealized_pnl, { sign: true })} label="Unrealized" />
        <StatCard value={usd(totals?.realized_pnl, { sign: true })} label="Realized (after fees)" />
        <StatCard value={String(trades.length)} label="Trades logged" />
      </div>

      <Card title="Add Trade">
        <form onSubmit={addTrade}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
              <label htmlFor="trade-instrument">Instrument</label>
              <InstrumentPicker id="trade-instrument" value={inst} onChange={setInst} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="trade-side">Side</label>
              <select id="trade-side" className="input" value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="buy">Buy (long, or cover a short)</option>
                <option value="sell">Sell (close a long, or go short)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="trade-qty">Quantity ({unit})</label>
              <input id="trade-qty" className="input" type="number" inputMode="decimal" step="any" min="0" required
                value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="trade-price">Price ({priceUnit})</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="trade-price" className="input" type="number" inputMode="decimal" step="any" min="0" required
                  value={tradePrice} onChange={(e) => setTradePrice(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="btn btn-sm btn-secondary" onClick={useMarketPrice} disabled={!inst}>Market</button>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="trade-fee">Fee ($)</label>
              <input id="trade-fee" className="input" type="number" inputMode="decimal" step="any" min="0"
                value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="trade-date">Date</label>
              <input id="trade-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button type="submit" className="btn" disabled={saving || !inst}>{saving ? 'Saving…' : 'Add Trade'}</button>
          </div>
          {inst?.asset_class === 'fx' && (
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              Buying {inst.symbol.slice(0, 3)}/{inst.currency} means long {inst.symbol.slice(0, 3)} against {inst.currency}.
              P&amp;L is in {inst.currency} and shown in USD at the current rate.
            </p>
          )}
          {futures && (
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              {inst.name} futures: P&amp;L is ${inst.multiplier.toLocaleString()} per contract for each 1.0 move in price.
            </p>
          )}
        </form>
        {error && <p className="negative" style={{ marginTop: '0.75rem' }}>{error}</p>}
        {notice && <p className="positive" style={{ marginTop: '0.75rem' }}>{notice}</p>}
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
          Many trades? <Link to="/csv-import">Import a CSV</Link> from Binance, Coinbase, Kraken, or any broker in the generic format.
        </p>
      </Card>

      <Card title="Trade History" className="mt-1">
        {loading ? <LoadingSpinner /> : trades.length === 0 ? (
          <p className="muted">No trades recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>{['Date', 'Instrument', 'Side', 'Quantity', 'Price', 'Value', 'Fee', ''].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{String(t.date || '').slice(0, 10)}</td>
                    <td>
                      <Link to={`/i/${encodeURIComponent(t.instrument_id)}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <ClassBadge cls={t.asset_class} /> <strong>{t.symbol}</strong>
                      </Link>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>{t.name}</div>
                    </td>
                    <td><span className={`badge ${t.side === 'buy' ? 'badge-green' : 'badge-red'}`}>{t.side.toUpperCase()}</span></td>
                    <td>{t.quantity}</td>
                    <td>{fmtPrice(t.price)}</td>
                    <td>{t.asset_class === 'fx'
                      ? <span className="muted">{(t.quantity * t.price).toLocaleString(undefined, { maximumFractionDigits: 0 })} {t.instrument_id.slice(-3)}</span>
                      : usd(t.quantity * t.price * (t.multiplier || 1))}</td>
                    <td className="muted">{t.fee ? usd(t.fee) : '--'}</td>
                    <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => deleteTrade(t)} aria-label={`Delete ${t.side} ${t.symbol} trade`}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {totals && totals.unpriced > 0 && (
        <p className={`muted ${tone(-1)}`} style={{ fontSize: '0.8rem' }}>
          {totals.unpriced} open position(s) have no live price right now; their unrealized P&amp;L is left out of the totals.
        </p>
      )}
    </div>
  )
}
