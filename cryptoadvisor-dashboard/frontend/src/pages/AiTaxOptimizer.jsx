import { useState } from 'react'
import { api } from '../api/client'
import AiInsightPanel from '../components/AiInsightPanel'

const styles = {
  section: {
    background: '#111827',
    border: '1px solid #2a2a3d',
    borderRadius: 12,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: '1.1rem',
    fontWeight: 700,
    marginTop: 0,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  btn: {
    padding: '0.5rem 1.25rem',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  secondaryBtn: {
    padding: '0.5rem 1.25rem',
    background: 'transparent',
    color: '#00d4aa',
    border: '1px solid #00d4aa',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  inputGroup: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: '1rem',
  },
  label: {
    color: '#64748b',
    fontSize: '0.8rem',
    display: 'block',
    marginBottom: 4,
    fontWeight: 600,
  },
  input: {
    padding: '0.5rem 0.75rem',
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '0.5rem 0.75rem',
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
  },
  error: {
    color: '#ff6b6b',
    marginTop: '0.75rem',
    fontSize: '0.9rem',
  },
  disclaimer: {
    background: '#0a0e1a',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    padding: '1rem',
    color: '#64748b',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loading: {
    color: '#7b61ff',
    padding: '0.5rem 0',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'dogecoin']

export default function AiTaxOptimizer() {
  const [harvestResult, setHarvestResult] = useState(null)
  const [harvestLoading, setHarvestLoading] = useState(false)
  const [harvestError, setHarvestError] = useState('')

  const [optimizeResult, setOptimizeResult] = useState(null)
  const [optimizeLoading, setOptimizeLoading] = useState(false)
  const [optimizeError, setOptimizeError] = useState('')

  const [tradeCoin, setTradeCoin] = useState('bitcoin')
  const [tradeType, setTradeType] = useState('buy')
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradePrice, setTradePrice] = useState('')
  const [impactResult, setImpactResult] = useState(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState('')

  const findHarvestOpportunities = async () => {
    setHarvestLoading(true)
    setHarvestError('')
    setHarvestResult(null)
    try {
      const res = await api.post('/api/ai/tax/harvest', {})
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)
      setHarvestResult(text)
    } catch (err) {
      setHarvestError(err.message || 'Failed to find opportunities')
    } finally {
      setHarvestLoading(false)
    }
  }

  const optimizeStrategy = async () => {
    setOptimizeLoading(true)
    setOptimizeError('')
    setOptimizeResult(null)
    try {
      const res = await api.post('/api/ai/tax/optimize', {})
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)
      setOptimizeResult(text)
    } catch (err) {
      setOptimizeError(err.message || 'Failed to optimize strategy')
    } finally {
      setOptimizeLoading(false)
    }
  }

  const estimateImpact = async () => {
    if (!tradeAmount || !tradePrice) return
    setImpactLoading(true)
    setImpactError('')
    setImpactResult(null)
    try {
      const res = await api.post('/api/ai/tax/impact', {
        coin: tradeCoin,
        type: tradeType,
        amount: parseFloat(tradeAmount),
        price: parseFloat(tradePrice),
      })
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)
      setImpactResult(text)
    } catch (err) {
      setImpactError(err.message || 'Failed to estimate impact')
    } finally {
      setImpactLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', marginBottom: '1.5rem' }}>AI Tax Optimizer</h1>

      {/* Tax-Loss Harvesting */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Tax-Loss Harvesting</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Find positions with unrealized losses that can be harvested to offset capital gains.
        </p>
        <button style={styles.btn} onClick={findHarvestOpportunities} disabled={harvestLoading}>
          {harvestLoading ? 'Searching...' : 'Find Opportunities'}
        </button>
        {harvestError && <p style={styles.error}>{harvestError}</p>}
        {harvestLoading && <div style={styles.loading}>Analyzing positions...</div>}
      </div>

      {harvestResult && (
        <AiInsightPanel
          title="Tax-Loss Harvesting Opportunities"
          content={harvestResult}
          onRefresh={findHarvestOpportunities}
        />
      )}

      {/* Strategy Optimization */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Strategy Optimization</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Get comprehensive tax strategy recommendations based on your portfolio and trading history.
        </p>
        <button style={styles.secondaryBtn} onClick={optimizeStrategy} disabled={optimizeLoading}>
          {optimizeLoading ? 'Optimizing...' : 'Optimize Strategy'}
        </button>
        {optimizeError && <p style={styles.error}>{optimizeError}</p>}
        {optimizeLoading && <div style={styles.loading}>Building optimization plan...</div>}
      </div>

      {optimizeResult && (
        <AiInsightPanel
          title="Tax Strategy Recommendations"
          content={optimizeResult}
          onRefresh={optimizeStrategy}
        />
      )}

      {/* Trade Impact Calculator */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Trade Impact Calculator</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Estimate the tax consequences of a proposed trade before executing.
        </p>
        <div style={styles.inputGroup}>
          <div style={{ minWidth: 120 }}>
            <label style={styles.label}>Coin</label>
            <select style={styles.select} value={tradeCoin} onChange={(e) => setTradeCoin(e.target.value)}>
              {COINS.map((c) => (
                <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 100 }}>
            <label style={styles.label}>Type</label>
            <select style={styles.select} value={tradeType} onChange={(e) => setTradeType(e.target.value)}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div style={{ minWidth: 100 }}>
            <label style={styles.label}>Amount</label>
            <input
              style={styles.input}
              type="number"
              step="any"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="0.5"
            />
          </div>
          <div style={{ minWidth: 120 }}>
            <label style={styles.label}>Price ($)</label>
            <input
              style={styles.input}
              type="number"
              step="any"
              value={tradePrice}
              onChange={(e) => setTradePrice(e.target.value)}
              placeholder="50000"
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button style={styles.btn} onClick={estimateImpact} disabled={impactLoading || !tradeAmount || !tradePrice}>
              {impactLoading ? 'Estimating...' : 'Estimate Impact'}
            </button>
          </div>
        </div>
        {impactError && <p style={styles.error}>{impactError}</p>}
        {impactLoading && <div style={styles.loading}>Calculating tax impact...</div>}
      </div>

      {impactResult && (
        <AiInsightPanel
          title="Estimated Tax Impact"
          content={impactResult}
          onRefresh={estimateImpact}
        />
      )}

      {/* Disclaimer */}
      <div style={styles.disclaimer}>
        AI suggestions are for informational purposes only. Consult a tax professional
        before making any tax-related decisions.
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
