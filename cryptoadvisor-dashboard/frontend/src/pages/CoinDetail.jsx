import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../App'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const Plot = lazy(() => import('react-plotly.js'))

const PERIODS = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

const fmt = (n) => {
  if (n == null) return '--'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function computeVolatility(prices) {
  if (!prices || prices.length < 2) return []
  const returns = []
  for (let i = 1; i < prices.length; i++) {
    const ret = Math.log(prices[i][1] / prices[i - 1][1])
    returns.push({ ts: prices[i][0], ret })
  }
  // Rolling 14-period standard deviation of log returns
  const window = Math.min(14, Math.floor(returns.length / 3))
  const result = []
  for (let i = window; i < returns.length; i++) {
    const slice = returns.slice(i - window, i).map(r => r.ret)
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length
    const vol = Math.sqrt(variance) * Math.sqrt(365) * 100 // annualized %
    result.push({ ts: returns[i].ts, vol })
  }
  return result
}

const chartLayout = {
  paper_bgcolor: '#0a0e1a',
  plot_bgcolor: '#0a0e1a',
  font: { color: '#e2e8f0', family: '-apple-system, BlinkMacSystemFont, sans-serif' },
  margin: { l: 60, r: 20, t: 30, b: 50 },
  xaxis: {
    gridcolor: '#1f2937',
    linecolor: '#1f2937',
    type: 'date',
  },
  yaxis: {
    gridcolor: '#1f2937',
    linecolor: '#1f2937',
    side: 'left',
  },
  dragmode: 'zoom',
  hovermode: 'x unified',
}

export default function CoinDetail() {
  const { coinId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [period, setPeriod] = useState(30)
  const [ohlcv, setOhlcv] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [coinInfo, setCoinInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isFav, setIsFav] = useState(false)

  const coinName = coinId.charAt(0).toUpperCase() + coinId.slice(1).replace(/-/g, ' ')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ohlcvRes, chartRes, priceRes] = await Promise.allSettled([
        api.get(`/api/market/ohlcv/${coinId}?days=${period}`),
        api.get(`/api/market/chart/${coinId}?days=${period}`),
        api.get(`/api/market/prices/${coinId}`),
      ])

      if (ohlcvRes.status === 'fulfilled') setOhlcv(ohlcvRes.value)
      else setError('Failed to load candlestick data')

      if (chartRes.status === 'fulfilled') setChartData(chartRes.value)
      if (priceRes.status === 'fulfilled') setCoinInfo(priceRes.value)
    } catch (err) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [coinId, period])

  useEffect(() => { fetchData() }, [fetchData])

  // Check if favorited
  useEffect(() => {
    api.get('/api/favorites/').then(res => {
      const favs = Array.isArray(res) ? res : res?.favorites || []
      setIsFav(favs.some(f => f.coin_id === coinId))
    }).catch(() => {})
  }, [coinId])

  const toggleFav = async () => {
    try {
      if (isFav) {
        await api.del(`/api/favorites/${coinId}`)
        setIsFav(false)
      } else {
        await api.post('/api/favorites/', { coin_id: coinId })
        setIsFav(true)
      }
    } catch {}
  }

  // Parse OHLCV data for candlestick: [[timestamp, open, high, low, close], ...]
  const ohlcvData = ohlcv?.ohlcv || []
  const dates = ohlcvData.map(d => new Date(d[0]))
  const opens = ohlcvData.map(d => d[1])
  const highs = ohlcvData.map(d => d[2])
  const lows = ohlcvData.map(d => d[3])
  const closes = ohlcvData.map(d => d[4])

  // Parse line chart data
  const prices = chartData?.chart?.prices || []
  const volumes = chartData?.chart?.total_volumes || []
  const priceDates = prices.map(p => new Date(p[0]))
  const priceValues = prices.map(p => p[1])
  const volDates = volumes.map(v => new Date(v[0]))
  const volValues = volumes.map(v => v[1])

  // Compute volatility
  const volData = computeVolatility(prices)
  const volDatesArr = volData.map(v => new Date(v.ts))
  const volVals = volData.map(v => v.vol)

  // Current price info
  const priceData = coinInfo?.[coinId] || {}
  const currentPrice = priceData.usd
  const change24h = priceData.usd_24h_change
  const marketCap = priceData.usd_market_cap
  const volume24h = priceData.usd_24h_vol

  return (
    <div>
      {/* Header */}
      <div className="coin-detail-header">
        <button className="btn btn-sm btn-outline" onClick={() => navigate(-1)}>
          {'\u2190'} Back
        </button>
        <div className="coin-detail-title">
          <h1>{coinName}</h1>
          <span className="coin-detail-id">{coinId.toUpperCase()}</span>
          <button className={`fav-star large ${isFav ? 'active' : ''}`} onClick={toggleFav}>
            {isFav ? '\u2605' : '\u2606'}
          </button>
        </div>
      </div>

      {/* Price stats */}
      {currentPrice != null && (
        <div className="coin-detail-stats">
          <div className="coin-detail-price">{fmt(currentPrice)}</div>
          {change24h != null && (
            <span className={`coin-detail-change ${change24h >= 0 ? 'positive' : 'negative'}`}>
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}% (24h)
            </span>
          )}
          <div className="coin-detail-meta">
            <span>Market Cap: {fmt(marketCap)}</span>
            <span>24h Volume: {fmt(volume24h)}</span>
          </div>
        </div>
      )}

      {/* Period selector */}
      <div className="period-selector">
        {PERIODS.map(p => (
          <button
            key={p.days}
            className={`period-btn ${period === p.days ? 'active' : ''}`}
            onClick={() => setPeriod(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <Suspense fallback={<LoadingSpinner />}>
          {/* Candlestick Chart */}
          {ohlcvData.length > 0 && (
            <Card title={`Price Action - ${PERIODS.find(p => p.days === period)?.label || ''}`}>
              <div className="chart-container">
                <Plot
                  data={[{
                    type: 'candlestick',
                    x: dates,
                    open: opens,
                    high: highs,
                    low: lows,
                    close: closes,
                    increasing: { line: { color: '#00d4aa' }, fillcolor: 'rgba(0,212,170,0.3)' },
                    decreasing: { line: { color: '#ff6b6b' }, fillcolor: 'rgba(255,107,107,0.3)' },
                    name: 'OHLC',
                  }]}
                  layout={{
                    ...chartLayout,
                    yaxis: { ...chartLayout.yaxis, title: { text: 'Price (USD)', font: { size: 12, color: '#64748b' } } },
                    xaxis: { ...chartLayout.xaxis, rangeslider: { visible: false } },
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: 420 }}
                />
              </div>
            </Card>
          )}

          {/* Price Line + Volume */}
          {priceValues.length > 0 && (
            <Card title="Price & Volume">
              <div className="chart-container">
                <Plot
                  data={[
                    {
                      type: 'scatter',
                      mode: 'lines',
                      x: priceDates,
                      y: priceValues,
                      name: 'Price',
                      line: { color: '#00d4aa', width: 2 },
                      yaxis: 'y',
                    },
                    {
                      type: 'bar',
                      x: volDates,
                      y: volValues,
                      name: 'Volume',
                      marker: { color: 'rgba(123,97,255,0.35)' },
                      yaxis: 'y2',
                    },
                  ]}
                  layout={{
                    ...chartLayout,
                    yaxis: {
                      ...chartLayout.yaxis,
                      title: { text: 'Price (USD)', font: { size: 12, color: '#64748b' } },
                    },
                    yaxis2: {
                      overlaying: 'y',
                      side: 'right',
                      gridcolor: 'transparent',
                      showgrid: false,
                      title: { text: 'Volume', font: { size: 12, color: '#64748b' } },
                    },
                    legend: { x: 0, y: 1.12, orientation: 'h', font: { color: '#64748b' } },
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: 380 }}
                />
              </div>
            </Card>
          )}

          {/* Volatility Chart */}
          {volVals.length > 0 && (
            <Card title="Annualized Volatility (Rolling 14-Period)">
              <div className="chart-container">
                <Plot
                  data={[{
                    type: 'scatter',
                    mode: 'lines',
                    x: volDatesArr,
                    y: volVals,
                    name: 'Volatility %',
                    fill: 'tozeroy',
                    fillcolor: 'rgba(255,217,61,0.1)',
                    line: { color: '#ffd93d', width: 2 },
                  }]}
                  layout={{
                    ...chartLayout,
                    yaxis: {
                      ...chartLayout.yaxis,
                      title: { text: 'Volatility (%)', font: { size: 12, color: '#64748b' } },
                    },
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: 320 }}
                />
              </div>
            </Card>
          )}

          {/* Price stats table */}
          {priceValues.length > 0 && (
            <Card title="Period Statistics">
              <div className="coin-stats-grid">
                <div className="coin-stat-item">
                  <span className="coin-stat-label">High</span>
                  <span className="coin-stat-value positive">{fmt(Math.max(...priceValues))}</span>
                </div>
                <div className="coin-stat-item">
                  <span className="coin-stat-label">Low</span>
                  <span className="coin-stat-value negative">{fmt(Math.min(...priceValues))}</span>
                </div>
                <div className="coin-stat-item">
                  <span className="coin-stat-label">Open</span>
                  <span className="coin-stat-value">{fmt(priceValues[0])}</span>
                </div>
                <div className="coin-stat-item">
                  <span className="coin-stat-label">Close</span>
                  <span className="coin-stat-value">{fmt(priceValues[priceValues.length - 1])}</span>
                </div>
                <div className="coin-stat-item">
                  <span className="coin-stat-label">Change</span>
                  <span className={`coin-stat-value ${priceValues[priceValues.length - 1] >= priceValues[0] ? 'positive' : 'negative'}`}>
                    {((priceValues[priceValues.length - 1] - priceValues[0]) / priceValues[0] * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="coin-stat-item">
                  <span className="coin-stat-label">Avg Volatility</span>
                  <span className="coin-stat-value" style={{ color: 'var(--warning)' }}>
                    {volVals.length > 0 ? `${(volVals.reduce((s, v) => s + v, 0) / volVals.length).toFixed(1)}%` : '--'}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </Suspense>
      )}
    </div>
  )
}
