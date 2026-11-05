import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import AiAnalysisButton from '../components/AiAnalysisButton'
import AiInsightPanel from '../components/AiInsightPanel'
import { ASSET_CLASSES, ClassBadge, classLabel, pct, price, tone, usd } from '../components/assetClass'

const CLASS_COLORS = { crypto: '#7b61ff', stock: '#4ecdc4', etf: '#00d4aa', commodity: '#ffd93d', bond: '#ff6b6b' }

function Allocation({ byClass }) {
  const rows = Object.entries(byClass || {}).filter(([, c]) => c.market_value)
  const gross = rows.reduce((s, [, c]) => s + Math.abs(c.market_value), 0)
  if (!gross) return null
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#1a1a2e' }} role="img"
        aria-label={rows.map(([k, c]) => `${classLabel(k)} ${Math.round((Math.abs(c.market_value) / gross) * 100)}%`).join(', ')}>
        {rows.map(([k, c]) => (
          <div key={k} style={{ width: `${(Math.abs(c.market_value) / gross) * 100}%`, background: CLASS_COLORS[k] || '#64748b' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', marginTop: 8, fontSize: '0.85rem' }}>
        {rows.map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CLASS_COLORS[k] || '#64748b' }} />
            {classLabel(k)} {Math.round((Math.abs(c.market_value) / gross) * 100)}%
            <span className={tone(c.unrealized_pnl)}>{usd(c.unrealized_pnl, { sign: true, compact: true })}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PositionRow({ p }) {
  return (
    <tr>
      <td>
        <Link to={`/i/${encodeURIComponent(p.instrument_id)}`}><strong>{p.symbol}</strong></Link>
        <div className="muted" style={{ fontSize: '0.75rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
      </td>
      <td><span className={`badge ${p.side === 'long' ? 'badge-green' : 'badge-red'}`}>{p.side.toUpperCase()}</span></td>
      <td>{Math.abs(p.quantity)}</td>
      <td className="muted">{price(p.avg_price)}</td>
      <td>
        {p.price_available ? price(p.price) : <span className="muted">unavailable</span>}
        {p.change_pct != null && <div className={tone(p.change_pct)} style={{ fontSize: '0.75rem' }}>{pct(p.change_pct)} today</div>}
      </td>
      <td><strong>{p.price_available ? usd(p.market_value) : '--'}</strong></td>
      <td className={tone(p.unrealized_pnl)}>
        {p.price_available ? <><strong>{usd(p.unrealized_pnl, { sign: true })}</strong><div style={{ fontSize: '0.75rem' }}>{pct(p.unrealized_pct)}</div></> : '--'}
      </td>
      <td className={tone(p.realized_pnl)}>{p.realized_pnl ? usd(p.realized_pnl, { sign: true }) : '--'}</td>
    </tr>
  )
}

function Portfolio() {
  const { data: pf, loading, refetch } = useFetch('/api/trades/portfolio')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)

  const positions = pf?.positions || []
  const closed = pf?.closed || []
  const t = pf?.totals || {}
  const groups = ASSET_CLASSES.map((c) => [c.value, positions.filter((p) => p.asset_class === c.value)]).filter(([, rows]) => rows.length)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Portfolio</h1>
        <AiAnalysisButton endpoint="/api/ai/copilot/portfolio" body={{}} label="AI Analysis" onResult={(text) => setAiInsight(text)} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={refetch}>Refresh prices</button>
      </div>

      <AiInsightPanel
        title="Portfolio AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true)
          api.post('/api/ai/copilot/portfolio', {})
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false))
        }}
        onClose={() => setAiInsight(null)}
      />

      {loading && !pf ? <LoadingSpinner /> : positions.length === 0 && closed.length === 0 ? (
        <Card title="Holdings">
          <p className="muted">No holdings yet. Your portfolio is built from the trades you log: stocks, ETFs, crypto, commodity and bond futures.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link className="btn" to="/trades">Add holding (log a trade)</Link>
            <Link className="btn btn-secondary" to="/csv-import">Import trades from CSV</Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
            <StatCard value={usd(t.market_value)} label="Net market value" />
            <StatCard value={usd(t.day_pnl, { sign: true })} label="Today" />
            <StatCard value={usd(t.unrealized_pnl, { sign: true })} label="Unrealized P&L" />
            <StatCard value={usd(t.realized_pnl, { sign: true })} label="Realized P&L (after fees)" />
          </div>

          <Card title="Allocation by asset class">
            <Allocation byClass={pf.by_class} />
            {(t.short_exposure > 0) && (
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
                Long exposure {usd(t.long_exposure, { compact: true })}, short exposure {usd(t.short_exposure, { compact: true })}.
              </p>
            )}
          </Card>

          {groups.map(([cls, rows]) => (
            <Card key={cls} title={`${classLabel(cls)} positions`} className="mt-1">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>{['Instrument', 'Side', 'Quantity', 'Avg price', 'Price', 'Value', 'Unrealized', 'Realized'].map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>{rows.map((p) => <PositionRow key={p.instrument_id} p={p} />)}</tbody>
                </table>
              </div>
            </Card>
          ))}

          {closed.length > 0 && (
            <Card title="Closed positions" className="mt-1">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr>{['Instrument', 'Class', 'Trades', 'Closed', 'Realized P&L'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {closed.map((p) => (
                      <tr key={p.instrument_id}>
                        <td><Link to={`/i/${encodeURIComponent(p.instrument_id)}`}><strong>{p.symbol}</strong></Link> <span className="muted">{p.name}</span></td>
                        <td><ClassBadge cls={p.asset_class} /></td>
                        <td>{p.trades}</td>
                        <td className="muted">{String(p.last_date || '').slice(0, 10)}</td>
                        <td className={tone(p.realized_pnl)}><strong>{usd(p.realized_pnl, { sign: true })}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {t.unpriced > 0 && (
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {t.unpriced} position(s) have no live price right now and are left out of the value and unrealized totals.
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.75rem' }}>Stock, ETF and futures prices are delayed about 15 minutes.</p>
        </>
      )}
    </div>
  )
}

export default Portfolio
