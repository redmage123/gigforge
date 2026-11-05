import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { ClassBadge, pct, price, quotePrice, tone, usd } from '../components/assetClass'

const Plot = lazy(() => import('react-plotly.js'))

const VIEWS = [
  { label: '1 week', timeframe: '1h', bars: 120 },
  { label: '1 month', timeframe: '3h', bars: 160 },
  { label: '6 months', timeframe: '1d', bars: 130 },
  { label: '2 years', timeframe: '3d', bars: 170 },
]
const SESSIONS = { '24/7': 'Trades 24/7', us_equity: 'US market hours', futures: 'Futures hours (nearly 24h on weekdays)', fx: 'Forex: 24h Monday to Friday', index: 'Reference series' }

const layout = {
  paper_bgcolor: '#0a0e1a', plot_bgcolor: '#0a0e1a', font: { color: '#e2e8f0' }, margin: { l: 60, r: 20, t: 10, b: 40 },
  xaxis: { gridcolor: '#1f2937', linecolor: '#1f2937', rangeslider: { visible: false } },
  yaxis: { gridcolor: '#1f2937', linecolor: '#1f2937', domain: [0.28, 1] },
  yaxis2: { gridcolor: '#1f2937', domain: [0, 0.22], title: { text: 'Volume $', font: { size: 11, color: '#64748b' } } },
  showlegend: false, hovermode: 'x unified', dragmode: 'zoom',
}

export default function InstrumentDetail() {
  const { instrumentId } = useParams()
  const [inst, setInst] = useState(null)
  const [quote, setQuote] = useState(null)
  const [view, setView] = useState(VIEWS[2])
  const [candles, setCandles] = useState(null)
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

  useEffect(() => {
    setCandles(null)
    api.get(`/api/instruments/${encodeURIComponent(instrumentId)}/candles?timeframe=${view.timeframe}&bars=${view.bars}`)
      .then((r) => setCandles(r.candles || []))
      .catch((err) => { setCandles([]); setError(err.message) })
  }, [instrumentId, view])

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

  const x = (candles || []).map((c) => new Date(c.t))
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
        <div role="group" aria-label="Chart range" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {VIEWS.map((v) => (
            <button key={v.label} type="button" className={`btn btn-sm ${v === view ? '' : 'btn-ghost'}`} aria-pressed={v === view} onClick={() => setView(v)}>
              {v.label} <span className="muted" style={{ fontSize: '0.75rem' }}>({v.timeframe})</span>
            </button>
          ))}
        </div>
        {candles === null ? <LoadingSpinner /> : candles.length === 0 ? <p className="muted">No price history available.</p> : (
          <Suspense fallback={<LoadingSpinner />}>
            <Plot
              data={[
                { type: 'candlestick', x, open: candles.map((c) => c.o), high: candles.map((c) => c.h), low: candles.map((c) => c.l),
                  close: candles.map((c) => c.c), increasing: { line: { color: '#00d4aa' } }, decreasing: { line: { color: '#ff6b6b' } }, name: inst.symbol },
                ...(inst.has_volume ? [{ type: 'bar', x, y: candles.map((c) => c.v), yaxis: 'y2', marker: { color: '#334155' }, name: 'Volume' }] : []),
              ]}
              layout={inst.has_volume ? layout : { ...layout, yaxis: { ...layout.yaxis, domain: [0, 1] }, yaxis2: undefined }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: 440 }}
            />
          </Suspense>
        )}
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
