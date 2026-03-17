import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { useDebounce } from '../hooks/useDebounce'

function SwapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

export default function Converter() {
  const [assets, setAssets] = useState({ cryptos: [], fiats: [] })
  const [fromCoin, setFromCoin] = useState('bitcoin')
  const [toCoin, setToCoin] = useState('ethereum')
  const [amount, setAmount] = useState('1')
  const [result, setResult] = useState(null)
  const [fiats, setFiats] = useState([])
  const [loading, setLoading] = useState(false)
  const [fiatLoading, setFiatLoading] = useState(false)

  const debouncedAmount = useDebounce(amount, 400)

  // Load supported assets
  useEffect(() => {
    api.get('/api/converter/assets').then(setAssets).catch(() => {})
  }, [])

  // Crypto-to-crypto conversion
  const doConvert = useCallback(async () => {
    const num = parseFloat(debouncedAmount)
    if (!num || num <= 0 || !fromCoin || !toCoin) {
      setResult(null)
      return
    }
    setLoading(true)
    try {
      const data = await api.get(`/api/converter/convert?from_coin=${fromCoin}&to=${toCoin}&amount=${num}`)
      setResult(data)
    } catch {
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [fromCoin, toCoin, debouncedAmount])

  // Fiat conversion
  const doFiat = useCallback(async () => {
    const num = parseFloat(debouncedAmount)
    if (!num || num <= 0 || !fromCoin) {
      setFiats([])
      return
    }
    setFiatLoading(true)
    try {
      const data = await api.get(`/api/converter/fiat?coin=${fromCoin}&amount=${num}`)
      setFiats(data.fiats || [])
    } catch {
      setFiats([])
    } finally {
      setFiatLoading(false)
    }
  }, [fromCoin, debouncedAmount])

  useEffect(() => { doConvert() }, [doConvert])
  useEffect(() => { doFiat() }, [doFiat])

  const swap = () => {
    setFromCoin(toCoin)
    setToCoin(fromCoin)
  }

  const cryptos = assets.cryptos || []
  const fromSymbol = cryptos.find(c => c.id === fromCoin)?.symbol || ''
  const toSymbol = cryptos.find(c => c.id === toCoin)?.symbol || ''

  const formatNum = (n) => {
    if (n == null) return '--'
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (n >= 0.001) return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
    return n.toLocaleString(undefined, { maximumFractionDigits: 10 })
  }

  return (
    <div>
      <h1>Crypto Converter</h1>

      <Card>
        <div className="converter-main">
          {/* From */}
          <div className="converter-field">
            <label className="converter-label">From</label>
            <div className="converter-input-row">
              <input
                type="number"
                className="form-input converter-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
                placeholder="0"
              />
              <select
                className="converter-select"
                value={fromCoin}
                onChange={(e) => setFromCoin(e.target.value)}
              >
                {cryptos.map(c => (
                  <option key={c.id} value={c.id}>{c.symbol} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Swap button */}
          <button className="converter-swap" onClick={swap} aria-label="Swap currencies">
            <SwapIcon />
          </button>

          {/* To */}
          <div className="converter-field">
            <label className="converter-label">To</label>
            <div className="converter-input-row">
              <input
                type="text"
                className="form-input converter-amount"
                value={loading ? '...' : result ? formatNum(result.result) : '--'}
                readOnly
              />
              <select
                className="converter-select"
                value={toCoin}
                onChange={(e) => setToCoin(e.target.value)}
              >
                {cryptos.map(c => (
                  <option key={c.id} value={c.id}>{c.symbol} — {c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Rate display */}
        {result && !loading && (
          <div className="converter-rate-display">
            <span>1 {fromSymbol} = {formatNum(result.rate)} {toSymbol}</span>
            <span className="muted" style={{ marginLeft: '1.5rem' }}>
              1 {fromSymbol} = ${formatNum(result.from_usd)} USD
            </span>
          </div>
        )}
      </Card>

      {/* Fiat price table */}
      <Card title={`${parseFloat(amount) || 1} ${fromSymbol} in World Currencies`}>
        {fiatLoading ? (
          <LoadingSpinner />
        ) : fiats.length === 0 ? (
          <p className="muted">Enter an amount above to see fiat conversions.</p>
        ) : (
          <div className="fiat-grid">
            {fiats.map(f => (
              <div key={f.currency} className="fiat-card">
                <div className="fiat-code">{f.currency}</div>
                <div className="fiat-value">{f.symbol}{formatNum(f.value)}</div>
                <div className="fiat-name">{f.name}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick cross-rate table */}
      <Card title="Quick Cross Rates">
        <QuickRates fromCoin={fromCoin} fromSymbol={fromSymbol} amount={parseFloat(amount) || 1} cryptos={cryptos} />
      </Card>
    </div>
  )
}

function QuickRates({ fromCoin, fromSymbol, amount, cryptos }) {
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/api/converter/rates')
      .then(setRates)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  const fromData = rates[fromCoin]
  if (!fromData) return <p className="muted">Rate data unavailable.</p>

  const fromUsd = fromData.usd || 0
  if (!fromUsd) return <p className="muted">No USD rate for this coin.</p>

  const targets = cryptos.filter(c => c.id !== fromCoin).slice(0, 12)

  return (
    <table>
      <thead>
        <tr>
          <th>Crypto</th>
          <th>Rate (1 {fromSymbol})</th>
          <th>{amount} {fromSymbol} =</th>
        </tr>
      </thead>
      <tbody>
        {targets.map(c => {
          const toData = rates[c.id]
          if (!toData || !toData.usd) return null
          const rate = fromUsd / toData.usd
          const value = rate * amount
          const fmt = (n) => n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : n.toLocaleString(undefined, { maximumFractionDigits: 8 })
          return (
            <tr key={c.id}>
              <td><strong>{c.symbol}</strong> <span className="muted">{c.name}</span></td>
              <td>{fmt(rate)}</td>
              <td>{fmt(value)} {c.symbol}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
