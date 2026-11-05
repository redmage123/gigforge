import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import AiAnalysisButton from '../components/AiAnalysisButton'
import AiInsightPanel from '../components/AiInsightPanel'

function Portfolio() {
  const { data: holdings, loading: hl } = useFetch('/api/portfolio/holdings')
  const { data: signals, loading: sl } = useFetch('/api/portfolio/signals')
  const { data: watchlist, loading: wl } = useFetch('/api/portfolio/watchlist')
  const [aiInsight, setAiInsight] = useState(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)

  // Positions come from the trade journal (/api/portfolio/holdings -> positions); legacy holdings as fallback
  const positionsArr = (holdings?.positions || []).filter((p) => p.quantity > 0)
  const holdingsArr = positionsArr.length ? positionsArr : holdings ? (Array.isArray(holdings) ? holdings : holdings.holdings || []) : []
  const usd = (n, digits = 2) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: digits })}`
  const prettyCoin = (id) => String(id || '').replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  const signalsArr = signals ? (Array.isArray(signals) ? signals : signals.signals || []) : []
  const watchlistArr = watchlist ? (Array.isArray(watchlist) ? watchlist : watchlist.items || []) : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Portfolio</h1>
        <AiAnalysisButton
          endpoint="/api/ai/copilot/portfolio"
          body={{}}
          label="AI Analysis"
          onResult={(text) => setAiInsight(text)}
        />
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

      <Card title="Holdings" className="mt-1">
        {hl ? <LoadingSpinner /> : holdingsArr.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {['Coin', 'Amount', 'Avg Price', 'Current Price', 'Value', 'P&L'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdingsArr.map((h, i) => {
                  const pnl = h.unrealized_pnl ?? h.pnl ?? h.profit_loss
                  const priced = h.price_available !== false
                  return (
                    <tr key={h.coin_id || i}>
                      <td><strong>{prettyCoin(h.coin_id || h.coin || h.symbol)}</strong></td>
                      <td>{h.quantity ?? h.amount}</td>
                      <td className="muted">{usd(h.avg_buy_price ?? h.avg_price ?? 0, 6)}</td>
                      <td>{priced ? usd(h.current_price ?? 0, 6) : <span className="muted">price unavailable</span>}</td>
                      <td><strong>{priced ? usd(h.current_value ?? h.value ?? 0) : '--'}</strong></td>
                      <td className={!priced ? 'muted' : (pnl || 0) >= 0 ? 'positive' : 'negative'}>
                        {priced ? (
                          <strong>
                            {(pnl || 0) >= 0 ? '+' : '-'}{usd(Math.abs(pnl || 0))}
                            {h.roi_percent != null && ` (${h.roi_percent >= 0 ? '+' : ''}${h.roi_percent}%)`}
                          </strong>
                        ) : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <p className="muted">No holdings yet. Your portfolio is built from the trades you log.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link className="btn" to="/trades">Add holding (log a Buy trade)</Link>
              <Link className="btn btn-secondary" to="/csv-import">Import trades from CSV</Link>
            </div>
          </div>
        )}
      </Card>

      <div className="grid-row" style={{ marginTop: '1rem' }}>
        <Card title="Signals">
          {sl ? <LoadingSpinner /> : signalsArr.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {signalsArr.map((s, i) => {
                const sigType = s.type || s.signal || 'hold'
                return (
                  <div key={i} className="card" style={{
                    borderLeft: `4px solid ${sigType === 'buy' ? '#4ade80' : sigType === 'sell' ? '#f87171' : '#facc15'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong>{s.coin || s.symbol}</strong>
                      <span className={`badge ${sigType}`}>{sigType.toUpperCase()}</span>
                    </div>
                    <div className="muted">{s.reason || s.description || ''}</div>
                  </div>
                )
              })}
            </div>
          ) : <p className="muted">No signals available.</p>}
        </Card>

        <Card title="Watchlist">
          {wl ? <LoadingSpinner /> : watchlistArr.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {watchlistArr.map((w, i) => (
                <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{w.coin || w.symbol || w.name}</strong>
                  <span>${Number(w.price || w.current_price || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">Watchlist is empty.</p>}
        </Card>
      </div>
    </div>
  )
}

export default Portfolio
