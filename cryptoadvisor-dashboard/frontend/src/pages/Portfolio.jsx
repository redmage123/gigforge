import { useState } from 'react'
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

  const holdingsArr = holdings ? (Array.isArray(holdings) ? holdings : holdings.holdings || []) : []
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
                {holdingsArr.map((h, i) => (
                  <tr key={i}>
                    <td><strong>{h.coin || h.symbol}</strong></td>
                    <td>{h.amount}</td>
                    <td className="muted">${Number(h.avg_price || h.avgPrice || 0).toLocaleString()}</td>
                    <td>${Number(h.current_price || h.currentPrice || 0).toLocaleString()}</td>
                    <td><strong>${Number(h.value || h.total_value || 0).toLocaleString()}</strong></td>
                    <td className={(h.pnl || h.profit_loss || 0) >= 0 ? 'positive' : 'negative'}>
                      <strong>{(h.pnl || h.profit_loss || 0) >= 0 ? '+' : ''}${Number(h.pnl || h.profit_loss || 0).toLocaleString()}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No holdings found.</p>}
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
