import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import PriceChart from '../components/chart/PriceChart'
import { ClassBadge, pct, price, quotePrice, tone, usd } from '../components/assetClass'

const SESSIONS = { '24/7': 'Trades 24/7', us_equity: 'US market hours', futures: 'Futures hours (nearly 24h on weekdays)', fx: 'Forex: 24h Monday to Friday', index: 'Reference series' }

export default function InstrumentDetail() {
  const { instrumentId } = useParams()
  const [inst, setInst] = useState(null)
  const [quote, setQuote] = useState(null)
  const [position, setPosition] = useState(null)
  const [watched, setWatched] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setInst(null); setQuote(null); setError('')
    const id = encodeURIComponent(instrumentId)
    api.get(`/api/instruments/${id}`).then(setInst).catch((err) => setError(err.message))
    api.get(`/api/instruments/quotes?ids=${id}`).then((r) => setQuote(r.quotes?.[instrumentId] || null)).catch(() => {})
    api.get('/api/favorites/list').then((r) => setWatched((r.favorites || []).includes(instrumentId))).catch(() => {})
    api.get('/api/trades/portfolio').then((pf) => {
      setPosition([...(pf.positions || []), ...(pf.closed || [])].find((p) => p.instrument_id === instrumentId) || null)
    }).catch(() => {})
  }, [instrumentId])

  const toggleWatch = async () => {
    try {
      if (watched) await api.del(`/api/favorites/${encodeURIComponent(instrumentId)}`)
      else await api.post('/api/favorites/', { instrument_id: instrumentId })
      setWatched(!watched)
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !inst) return <Card title="Instrument"><p className="negative">{error}</p><Link to="/">Back to the dashboard</Link></Card>
  if (!inst) return <LoadingSpinner />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>{inst.name}</h1>
        <span className="muted">{inst.symbol}{inst.exchange ? ` · ${inst.exchange}` : ''}</span>
        <ClassBadge cls={inst.asset_class} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <span style={{ fontSize: '2rem', fontWeight: 700 }}>
          {quote ? quotePrice(quote.price, inst) : '--'}
        </span>
        {quote && <span className={tone(quote.change_pct)} style={{ fontSize: '1.1rem' }}>{pct(quote.change_pct)}</span>}
        {quote?.delayed && <span className="muted" style={{ fontSize: '0.8rem' }}>delayed ~15 min</span>}
        <span className="muted" style={{ fontSize: '0.8rem' }}>{SESSIONS[inst.sessions]}</span>
        {inst.tradable && <Link className="btn btn-sm" to={`/trades?instrument=${encodeURIComponent(inst.id)}`}>Log trade</Link>}
        <button type="button" className={`btn btn-sm ${watched ? 'btn-secondary' : 'btn-ghost'}`} aria-pressed={watched} onClick={toggleWatch}>
          {watched ? '\u2605 On watchlist' : '\u2606 Add to watchlist'}
        </button>
      </div>

      <Card title="Price">
        <PriceChart instrumentId={instrumentId} instrument={inst} />
      </Card>

      <div className="grid grid-2 mt-1">
        <Card title="Your position">
          {!position ? <p className="muted">You haven't traded {inst.symbol}.</p> : position.quantity === 0 ? (
            <p>Closed. Realized P&amp;L <strong className={tone(position.realized_pnl)}>{usd(position.realized_pnl, { sign: true })}</strong> over {position.trades} trades.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem' }}>
              <span className="muted">Side</span><span>{position.side} {Math.abs(position.quantity)}</span>
              <span className="muted">Average price</span><span>{price(position.avg_price)}</span>
              <span className="muted">Market value</span><span>{usd(position.market_value)}</span>
              <span className="muted">Unrealized</span><span className={tone(position.unrealized_pnl)}>{usd(position.unrealized_pnl, { sign: true })} ({pct(position.unrealized_pct)})</span>
              <span className="muted">Realized</span><span className={tone(position.realized_pnl)}>{usd(position.realized_pnl, { sign: true })}</span>
            </div>
          )}
        </Card>
        <Card title="Details">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem' }}>
            <span className="muted">Instrument id</span><code>{inst.id}</code>
            {inst.multiplier !== 1 && <><span className="muted">Contract size</span><span>${inst.multiplier.toLocaleString()} per 1.0 price move</span></>}
            {quote?.volume != null && <><span className="muted">Volume (last session)</span><span>{usd(quote.volume, { compact: true })}</span></>}
            <span className="muted">Data source</span><span>{quote?.source || '--'}{quote?.stale ? ' (cached)' : ''}</span>
          </div>
        </Card>
      </div>
    </div>
  )
}
