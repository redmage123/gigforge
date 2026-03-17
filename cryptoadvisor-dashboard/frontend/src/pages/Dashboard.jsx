import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
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
          setFavorites(data.map(f => f.coin_id))
        } else if (data?.favorites) {
          setFavPrices(data.favorites || [])
          setFavorites((data.favorites || []).map(f => f.coin_id))
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
        await api.del(`/api/favorites/${coinId}`)
        setFavorites(prev => prev.filter(f => f !== coinId))
        setFavPrices(prev => prev.filter(f => f.coin_id !== coinId))
      } else {
        await api.post('/api/favorites/', { coin_id: coinId })
        setFavorites(prev => [...prev, coinId])
        // Add from prices data if available
        const coin = allCoins.find(c => c.id === coinId)
        if (coin) {
          setFavPrices(prev => [...prev, {
            coin_id: coinId,
            current_price: coin.current_price,
            price_change_24h: coin.price_change_percentage_24h,
          }])
        }
      }
    } catch {}
  }

  if (lp && !prices) return <LoadingSpinner />

  const allCoins = Array.isArray(prices) ? prices : []
  const topCoins = allCoins.slice(0, 8)
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
              ? `You have ${alerts.length} active alert${alerts.length > 1 ? 's' : ''} and ${favorites.length} watched coin${favorites.length !== 1 ? 's' : ''}`
              : `Tracking ${favorites.length} coin${favorites.length !== 1 ? 's' : ''} across the crypto market`}
          </p>
        </div>
      </div>

      {/* Quick Stats */}
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
              const coin = allCoins.find(c => c.id === fav.coin_id)
              const price = coin?.current_price ?? fav.current_price
              const change = coin?.price_change_percentage_24h ?? fav.price_change_24h
              const image = coin?.image
              const name = coin?.name || fav.coin_id
              const symbol = coin?.symbol || fav.coin_id

              return (
                <Card key={fav.coin_id} className="coin-card-interactive" onClick={() => navigate(`/coin/${fav.coin_id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    {image && <img src={image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{name}</strong>
                        <span className="muted">({symbol.toUpperCase()})</span>
                        <FavoriteStar coinId={fav.coin_id} favorites={favorites} onToggle={toggleFavorite} />
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        {price != null ? `$${price.toLocaleString()}` : '--'}
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
              <Card key={coin.id} className="coin-card-interactive" onClick={() => navigate(`/coin/${coin.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  {coin.image && <img src={coin.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{coin.name}</strong>
                      <span className="muted">({(coin.symbol || '').toUpperCase()})</span>
                      <FavoriteStar coinId={coin.id} favorites={favorites} onToggle={toggleFavorite} />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                      ${coin.current_price?.toLocaleString() ?? '--'}
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
                    <span className="alert-mini-coin">{a.coin_id}</span>
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
              <button className="quick-action-btn" onClick={() => navigate('/gas')}>
                <span className="qa-icon">{'\u26FD'}</span>
                <span>Gas</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
