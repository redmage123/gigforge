import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import { Link } from 'react-router-dom'
import { price as fmtPrice, pct, tone } from '../components/assetClass'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const fmt = (n) => {
  if (n == null) return '--'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${Number(n).toLocaleString()}`
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const ACTIVITY_ICONS = {
  trade: '\u21C4',
  alert: '\uD83D\uDD14',
  notification: '\u2139\uFE0F',
}

function FearGreedGauge({ value, label }) {
  const color = value <= 25 ? '#f87171' : value <= 45 ? '#fb923c' : value <= 55 ? '#facc15' : value <= 75 ? '#a3e635' : '#4ade80'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 120, height: 120, borderRadius: '50%', border: `6px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem',
      }}>
        <span style={{ fontSize: '2rem', fontWeight: 700, color }}>{value ?? '--'}</span>
      </div>
      <div className="muted">{label || 'Fear & Greed'}</div>
    </div>
  )
}

// One row of instruments per group; quotes refresh every minute
const MARKET_GROUPS = [
  { title: 'Stocks', ids: ['index:SPX', 'index:NDX', 'index:DJI', 'index:VIX'] },
  { title: 'Rates & dollar', ids: ['rate:US3M', 'rate:US10Y', 'rate:US30Y', 'index:DXY'] },
  { title: 'Commodities', ids: ['commodity:GC', 'commodity:SI', 'commodity:CL', 'commodity:NG'] },
  { title: 'Crypto', ids: ['crypto:BTC', 'crypto:ETH', 'crypto:SOL', 'crypto:XRP'] },
]
const MARKET_LABELS = {
  'index:SPX': 'S&P 500', 'index:NDX': 'Nasdaq-100', 'index:DJI': 'Dow', 'index:VIX': 'VIX', 'rate:US3M': '3M T-bill',
  'rate:US10Y': '10Y yield', 'rate:US30Y': '30Y yield', 'index:DXY': 'US dollar', 'commodity:GC': 'Gold', 'commodity:SI': 'Silver',
  'commodity:CL': 'WTI oil', 'commodity:NG': 'Nat gas', 'crypto:BTC': 'Bitcoin', 'crypto:ETH': 'Ethereum', 'crypto:SOL': 'Solana', 'crypto:XRP': 'XRP',
}

function MarketsOverview() {
  const [quotes, setQuotes] = useState({})
  useEffect(() => {
    const ids = MARKET_GROUPS.flatMap((g) => g.ids).join(',')
    const load = () => api.get(`/api/instruments/quotes?ids=${encodeURIComponent(ids)}`).then((r) => setQuotes(r.quotes || {})).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="dashboard-section">
      <div className="section-header"><h3>Markets</h3><span className="muted" style={{ fontSize: '0.75rem' }}>Stocks, rates and futures delayed ~15 min</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
        {MARKET_GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.3rem 0.75rem', fontSize: '0.9rem' }}>
              {g.ids.map((id) => {
                const q = quotes[id]
                const isRate = id.startsWith('rate:')
                return [
                  <Link key={`${id}-n`} to={`/i/${encodeURIComponent(id)}`}>{MARKET_LABELS[id]}</Link>,
                  <span key={`${id}-p`} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {q ? `${fmtPrice(q.price, isRate ? 3 : undefined)}${isRate ? '%' : ''}` : '--'}
                  </span>,
                  <span key={`${id}-c`} className={tone(q?.change_pct)} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{q ? pct(q.change_pct) : ''}</span>,
                ]
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function FavoriteStar({ coinId, favorites, onToggle }) {
  const isFav = favorites.includes(coinId)
  return (
    <button
      className={`fav-star ${isFav ? 'active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle(coinId) }}
      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFav ? '\u2605' : '\u2606'}
    </button>
  )
}

function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const displayName = user?.first_name || user?.username || user?.sub || 'User'

  // Market data
  const { data: prices, loading: lp } = useFetch('/api/market/prices', 60000)
  // Top coins come from Binance volumes (CoinGecko's free tier rate-limits too often to rely on)
  const { data: topData } = useFetch('/api/instruments/top?asset_class=crypto&limit=8', 60000)
  const { data: global } = useFetch('/api/market/global')
  const { data: feargreed, loading: lf } = useFetch('/api/market/fear-greed')

  // Personalized data
  const [widgets, setWidgets] = useState(null)
  const [favorites, setFavorites] = useState([])
  const [favPrices, setFavPrices] = useState([])
  const [activity, setActivity] = useState([])
  const [alerts, setAlerts] = useState([])

  const fetchPersonalData = useCallback(async () => {
    try {
      const [settingsRes, favsRes, actRes, alertsRes] = await Promise.allSettled([
        api.get('/api/settings/'),
        api.get('/api/favorites/'),
        api.get('/api/activity/?limit=10'),
        api.get('/api/alerts/'),
      ])
      if (settingsRes.status === 'fulfilled') {
        const w = settingsRes.value?.widget_layout || settingsRes.value?.widgets
        if (Array.isArray(w) && w.length > 0) setWidgets(w)
      }
      if (favsRes.status === 'fulfilled') {
        const data = favsRes.value
        if (Array.isArray(data)) {
          setFavPrices(data)
          setFavorites(data.map(f => f.instrument_id || f.coin_id))
        } else if (data?.favorites) {
          setFavPrices(data.favorites || [])
          setFavorites((data.favorites || []).map(f => f.instrument_id || f.coin_id))
        }
      }
      if (actRes.status === 'fulfilled') {
        setActivity(actRes.value?.items || [])
      }
      if (alertsRes.status === 'fulfilled') {
        const all = Array.isArray(alertsRes.value) ? alertsRes.value : alertsRes.value?.alerts || []
        setAlerts(all.filter(a => a.active))
      }
    } catch {}
  }, [])

  useEffect(() => { fetchPersonalData() }, [fetchPersonalData])

  const toggleFavorite = async (coinId) => {
    try {
      if (favorites.includes(coinId)) {
        await api.del(`/api/favorites/${encodeURIComponent(coinId)}`)
        setFavorites(prev => prev.filter(f => f !== coinId))
        setFavPrices(prev => prev.filter(f => (f.instrument_id || f.coin_id) !== coinId))
      } else {
        await api.post('/api/favorites/', { instrument_id: coinId })
        setFavorites(prev => [...prev, coinId])
        // Add from prices data if available
        const coin = topCoins.find(c => c.id === coinId) || allCoins.find(c => `crypto:${(c.symbol || '').toUpperCase()}` === coinId)
        if (coin) {
          setFavPrices(prev => [...prev, {
            instrument_id: coinId, coin_id: coinId, symbol: (coin.symbol || '').toUpperCase(), name: coin.name, asset_class: 'crypto',
            current_price: coin.current_price,
            price_change_24h: coin.price_change_percentage_24h,
          }])
        }
      }
    } catch {}
  }

  if (lp && !prices && !topData) return <LoadingSpinner />

  const allCoins = Array.isArray(prices) ? prices : []
  const topCoins = (topData?.results || []).map((r) => {
    const cg = allCoins.find((c) => (c.symbol || '').toUpperCase() === r.symbol)
    return { id: r.id, symbol: r.symbol, name: r.name, image: cg?.image, current_price: r.quote.price,
      price_change_percentage_24h: r.quote.change_pct, total_volume: r.quote.volume }
  })
  const gd = global?.data || global || {}
  const fg = feargreed?.data?.[0] || feargreed || {}

  // Widget visibility helper
  const isEnabled = (id) => {
    if (!widgets) return true // show all by default
    const w = widgets.find(w => w.id === id)
    return w ? w.enabled !== false : true
  }

  const dominanceData = gd.market_cap_percentage ? {
    labels: Object.keys(gd.market_cap_percentage).slice(0, 6),
    datasets: [{
      data: Object.values(gd.market_cap_percentage).slice(0, 6),
      backgroundColor: ['#f7931a', '#627eea', '#14f195', '#e84142', '#2775ca', '#8247e5'],
      borderWidth: 0,
    }],
  } : null

  const volumeData = topCoins.length > 0 ? {
    labels: topCoins.map((c) => (c.symbol || '').toUpperCase()),
    datasets: [{
      label: '24h Volume',
      data: topCoins.map((c) => c.total_volume || 0),
      backgroundColor: '#646cff88',
      borderColor: '#646cff',
      borderWidth: 1,
      borderRadius: 4,
    }],
  } : null

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: {
      x: { ticks: { color: '#888' }, grid: { color: '#1a1a2e' } },
      y: { ticks: { color: '#888', callback: (v) => fmt(v) }, grid: { color: '#1a1a2e' } },
    },
  }

  return (
    <div>
      {/* Personalized Greeting Banner */}
      <div className="dashboard-banner">
        <div className="dashboard-banner-content">
          <h1 className="dashboard-banner-title">{getGreeting()}, {displayName}</h1>
          <p className="dashboard-banner-subtitle">
            {alerts.length > 0
              ? `You have ${alerts.length} active alert${alerts.length > 1 ? 's' : ''} and ${favorites.length} instrument${favorites.length !== 1 ? 's' : ''} on your watchlist`
              : `Watching ${favorites.length} instrument${favorites.length !== 1 ? 's' : ''} across stocks, commodities, rates and crypto`}
          </p>
        </div>
      </div>

      <MarketsOverview />

      {/* Crypto market stats */}
      {isEnabled('market_overview') && (
        <div className="grid-row">
          <StatCard label="Market Cap" value={fmt(gd.total_market_cap?.usd)} />
          <StatCard label="24h Volume" value={fmt(gd.total_volume?.usd)} />
          <StatCard label="BTC Dominance" value={gd.market_cap_percentage?.btc ? `${gd.market_cap_percentage.btc.toFixed(1)}%` : '--'} />
          <StatCard label="Active Coins" value={gd.active_cryptocurrencies?.toLocaleString() || '--'} />
        </div>
      )}

      {/* Favorites Watchlist */}
      {favPrices.length > 0 && (
        <div className="dashboard-section">
          <div className="section-header">
            <h3>Your Watchlist</h3>
            <button className="btn-link" onClick={() => navigate('/portfolio')}>View All</button>
          </div>
          <div className="coin-grid">
            {favPrices.map((fav) => {
              const id = fav.instrument_id || fav.coin_id
              const coin = fav.asset_class === 'crypto' ? allCoins.find(c => (c.symbol || '').toUpperCase() === fav.symbol) : null
              const price = fav.current_price ?? coin?.current_price
              const change = fav.price_change_24h ?? coin?.price_change_percentage_24h
              const image = coin?.image
              const name = fav.name || id
              const symbol = fav.symbol || id
              const isRate = fav.asset_class === 'rate'

              return (
                <Card key={id} className="coin-card-interactive" onClick={() => navigate(`/i/${encodeURIComponent(id)}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    {image && <img src={image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{name}</strong>
                        <span className="muted">({symbol.toUpperCase()})</span>
                        <FavoriteStar coinId={id} favorites={favorites} onToggle={toggleFavorite} />
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        {price != null ? `${isRate || fav.asset_class === 'index' ? '' : '$'}${fmtPrice(price, fav.price_decimals)}${isRate ? '%' : ''}` : '--'}
                      </div>
                      <div className={change >= 0 ? 'positive' : 'negative'}>
                        {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--'}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Market Coins (with star ability) */}
      {isEnabled('price_cards') && (
        <div className="dashboard-section">
          <div className="section-header">
            <h3>Top Coins</h3>
          </div>
          <div className="coin-grid">
            {topCoins.map((coin) => (
              <Card key={coin.id} className="coin-card-interactive" onClick={() => navigate(`/i/${encodeURIComponent(coin.id)}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  {coin.image && <img src={coin.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{coin.name}</strong>
                      <span className="muted">({(coin.symbol || '').toUpperCase()})</span>
                      <FavoriteStar coinId={coin.id} favorites={favorites} onToggle={toggleFavorite} />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                      ${fmtPrice(coin.current_price)}
                    </div>
                    <div className={coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}>
                      {coin.price_change_percentage_24h != null
                        ? `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%`
                        : '--'}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Charts + Activity Row */}
      <div className="dashboard-bottom-grid">
        <div className="dashboard-charts-col">
          {isEnabled('fear_greed') && (
            <Card title="Fear & Greed Index">
              {lf ? <LoadingSpinner /> : <FearGreedGauge value={fg.value ? Number(fg.value) : null} label={fg.value_classification} />}
            </Card>
          )}

          {isEnabled('dominance') && dominanceData && (
            <Card title="Market Dominance">
              <div style={{ height: 250 }}>
                <Doughnut data={dominanceData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#aaa' } } } }} />
              </div>
            </Card>
          )}

          {isEnabled('volume') && volumeData && (
            <Card title="24h Volume by Coin">
              <div style={{ height: 250 }}>
                <Bar data={volumeData} options={chartOpts} />
              </div>
            </Card>
          )}
        </div>

        {/* Activity Feed + Alerts Summary */}
        <div className="dashboard-personal-col">
          {isEnabled('alerts_summary') && alerts.length > 0 && (
            <Card title="Active Alerts" className="dashboard-alerts-card">
              <div className="alerts-mini-list">
                {alerts.slice(0, 5).map((a) => (
                  <div key={a.id} className="alert-mini-item">
                    <span className="alert-mini-coin">{a.symbol || a.coin_id}</span>
                    <span className="alert-mini-dir">{a.direction}</span>
                    <span className="alert-mini-price">${a.target_price?.toLocaleString()}</span>
                  </div>
                ))}
                {alerts.length > 5 && (
                  <button className="btn-link" onClick={() => navigate('/alerts')}>
                    +{alerts.length - 5} more alerts
                  </button>
                )}
              </div>
            </Card>
          )}

          {isEnabled('recent_trades') && activity.length > 0 && (
            <Card title="Recent Activity" className="dashboard-activity-card">
              <div className="activity-feed">
                {activity.map((item, i) => (
                  <div key={i} className="activity-item">
                    <span className="activity-icon">{ACTIVITY_ICONS[item.type] || '\u2022'}</span>
                    <div className="activity-body">
                      <div className="activity-title">{item.title}</div>
                      <div className="activity-desc">{item.description}</div>
                    </div>
                    <span className="activity-time">{timeAgo(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <Card title="Quick Actions" className="dashboard-quick-actions">
            <div className="quick-actions-grid">
              <button className="quick-action-btn" onClick={() => navigate('/alerts')}>
                <span className="qa-icon">{'\uD83D\uDD14'}</span>
                <span>Set Alert</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/trades')}>
                <span className="qa-icon">{'\u21C4'}</span>
                <span>Log Trade</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/converter')}>
                <span className="qa-icon">{'\uD83D\uDCB1'}</span>
                <span>Convert</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/ai-briefing')}>
                <span className="qa-icon">{'\uD83E\uDDE0'}</span>
                <span>AI Brief</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/wallet')}>
                <span className="qa-icon">{'\uD83D\uDCB0'}</span>
                <span>Wallets</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/notifications')}>
                <span className="qa-icon">{'\uD83D\uDE80'}</span>
                <span>In-Play</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
