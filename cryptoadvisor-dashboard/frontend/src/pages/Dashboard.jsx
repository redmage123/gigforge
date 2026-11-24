import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../App'
import { useFetch } from '../hooks/useFetch'
import { api } from '../api/client'
import { price as fmtPrice, pct, tone } from '../components/assetClass'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import InstrumentPicker from '../components/InstrumentPicker'
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
const signed = (n) => (n == null ? 'unchanged' : `${n >= 0 ? 'up' : 'down'} ${Math.abs(n).toFixed(2)}%`)

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

const ACTIVITY_ICONS = { trade: '⇄', alert: '🔔', notification: 'ℹ️' }

// Short names for the default Markets instruments; others use the instrument's own name
const MARKET_LABELS = {
  'index:SPX': 'S&P 500', 'index:NDX': 'Nasdaq-100', 'index:DJI': 'Dow', 'index:VIX': 'VIX', 'rate:US3M': '3M T-bill',
  'rate:US10Y': '10Y yield', 'rate:US30Y': '30Y yield', 'index:DXY': 'US dollar', 'commodity:GC': 'Gold', 'commodity:SI': 'Silver',
  'commodity:CL': 'WTI oil', 'commodity:NG': 'Nat gas', 'fx:EURUSD': 'EUR/USD', 'fx:USDJPY': 'USD/JPY',
  'fx:GBPUSD': 'GBP/USD', 'fx:USDCNH': 'USD/CNH', 'crypto:BTC': 'Bitcoin', 'crypto:ETH': 'Ethereum', 'crypto:SOL': 'Solana', 'crypto:XRP': 'XRP',
}

// What each tile is, shown on its (i) button and read out by screen readers
const TILE_INFO = {
  stats: ['Crypto market stats', 'Total crypto market capitalization, 24-hour trading volume, Bitcoin\'s share of the market and the number of coins tracked.'],
  watchlist: ['Your watchlist', 'Instruments you starred, with the latest price and the change over the last 24 hours (or since the last session for stocks). Select one to open its chart.'],
  top_coins: ['Top coins', 'The most-traded well-known cryptocurrencies right now, by 24-hour volume, with price and 24-hour change. Star one to add it to your watchlist.'],
  fear_greed: ['Fear & Greed index', 'A 0-100 gauge of crypto market sentiment: 0-25 extreme fear, 26-45 fear, 46-55 neutral, 56-75 greed, 76-100 extreme greed.'],
  dominance: ['Market dominance', 'Each large coin\'s share of the total crypto market capitalization.'],
  volume: ['24h volume by coin', 'Dollar trading volume over the last 24 hours for the top coins.'],
  alerts: ['Active alerts', 'Your alerts that have not fired yet: the instrument, what is watched, the time scale and the level.'],
  activity: ['Recent activity', 'Your latest trades, fired alerts and notifications, newest first.'],
  quick_actions: ['Quick actions', 'Shortcuts to set an alert, log a trade, convert currencies, read the AI briefing, open wallets and see In-Play.'],
}
const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Large', full: 'Full width' }

function priceText(id, q, decimals) {
  if (!q) return '--'
  const isRate = id.startsWith('rate:')
  const d = decimals ?? (isRate ? 3 : id.startsWith('fx:') ? (/JPY|CNH/.test(id) ? 3 : 4) : undefined)
  return `${fmtPrice(q.price, d)}${isRate ? '%' : ''}`
}

function FearGreedGauge({ value, label }) {
  const color = value <= 25 ? '#f87171' : value <= 45 ? '#fb923c' : value <= 55 ? '#facc15' : value <= 75 ? '#a3e635' : '#4ade80'
  return (
    <div style={{ textAlign: 'center' }} role="img" aria-label={value == null ? 'Fear and Greed index unavailable' : `Fear and Greed index ${value} out of 100: ${label}`}>
      <div style={{ width: 120, height: 120, borderRadius: '50%', border: `6px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.5rem' }}>
        <span style={{ fontSize: '2rem', fontWeight: 700, color }}>{value ?? '--'}</span>
      </div>
      <div className="muted">{label || 'Fear & Greed'}</div>
    </div>
  )
}

function FavoriteStar({ id, name, favorites, onToggle }) {
  const isFav = favorites.includes(id)
  return (
    <button type="button" className={`fav-star ${isFav ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(id) }}
      aria-pressed={isFav} aria-label={isFav ? `Remove ${name} from your watchlist` : `Add ${name} to your watchlist`}
      title={isFav ? 'Remove from watchlist' : 'Add to watchlist'}>
      {isFav ? '★' : '☆'}
    </button>
  )
}

function InstrumentCard({ id, name, symbol, image, priceLabel, change, favorites, onToggle }) {
  const navigate = useNavigate()
  const label = `${name} (${symbol}): ${priceLabel}, ${signed(change)}. Open its chart.`
  return (
    <div className="card coin-card-interactive" role="link" tabIndex={0} aria-label={label} title={label}
      onClick={() => navigate(`/i/${encodeURIComponent(id)}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/i/${encodeURIComponent(id)}`)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
        {image && <img src={image} alt={`${name} logo`} style={{ width: 32, height: 32, borderRadius: '50%' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</strong>
            <span className="muted">({symbol})</span>
            <FavoriteStar id={id} name={name} favorites={favorites} onToggle={onToggle} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{priceLabel}</div>
          <div className={change >= 0 ? 'positive' : 'negative'}>{change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--'}</div>
        </div>
      </div>
    </div>
  )
}

/** One dashboard tile: a titled region with an (i) description, plus move/size/hide controls while editing. */
function Tile({ tile, title, description, editing, index, count, onMove, onSize, onHide, onDragStart, onDrop, extraControls, children }) {
  const headingId = `tile-${tile.id.replace(':', '-')}-title`
  const descId = `tile-${tile.id.replace(':', '-')}-desc`
  return (
    <section className={`dash-tile dash-${tile.size}${tile.hidden ? ' dash-hidden' : ''}${editing ? ' dash-editing' : ''}`}
      aria-labelledby={headingId} aria-describedby={descId}
      draggable={editing} onDragStart={editing ? onDragStart : undefined}
      onDragOver={editing ? (e) => e.preventDefault() : undefined} onDrop={editing ? onDrop : undefined}>
      <div className="card dash-card">
        <div className="dash-tile-head">
          {editing && <span className="dash-grip" aria-hidden="true" title="Drag to move">{'⠇'}</span>}
          <h3 id={headingId}>{title}</h3>
          <button type="button" className="dash-info" aria-label={`About ${title}`} title={description}>i</button>
          {editing && (
            <div className="dash-controls">
              <button type="button" className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${title} earlier`}>{'↑'}</button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${title} later`}>{'↓'}</button>
              <select className="input dash-size" value={tile.size} onChange={(e) => onSize(e.target.value)} aria-label={`Width of ${title}`}>
                {Object.entries(SIZE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onHide} aria-pressed={tile.hidden}>
                {tile.hidden ? 'Show' : 'Hide'}
              </button>
              {extraControls}
            </div>
          )}
        </div>
        <p id={descId} className="sr-only">{description}</p>
        {editing && tile.hidden ? <p className="muted" style={{ margin: 0 }}>Hidden. Select Show to put it back on your dashboard.</p> : children}
      </div>
    </section>
  )
}

function GroupEditor({ group, onChange, onDelete, names }) {
  const [picked, setPicked] = useState(null)
  const add = (inst) => {
    setPicked(null)
    if (!inst || group.ids.includes(inst.id) || group.ids.length >= 12) return
    onChange({ ...group, ids: [...group.ids, inst.id] }, inst)
  }
  return (
    <div className="dash-group-editor">
      <label htmlFor={`grp-${group.id}-title`} className="muted" style={{ fontSize: '0.8rem' }}>Tile name</label>
      <input id={`grp-${group.id}-title`} className="input" value={group.title} maxLength={40}
        onChange={(e) => onChange({ ...group, title: e.target.value })} />
      <ul className="dash-group-list">
        {group.ids.map((id) => (
          <li key={id}>
            <span>{names[id] || id}</span>
            <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove ${names[id] || id} from ${group.title}`}
              onClick={() => onChange({ ...group, ids: group.ids.filter((x) => x !== id) })}>{'×'}</button>
          </li>
        ))}
      </ul>
      {group.ids.length < 12 ? (
        <>
          <label htmlFor={`grp-${group.id}-add`} className="muted" style={{ fontSize: '0.8rem' }}>Add an instrument</label>
          <InstrumentPicker id={`grp-${group.id}-add`} value={picked} onChange={add} tradableOnly={false} placeholder="Search AAPL, gold, EUR/USD…" />
        </>
      ) : <p className="muted" style={{ fontSize: '0.8rem' }}>A tile holds up to 12 instruments.</p>}
      <button type="button" className="btn btn-sm btn-danger" style={{ marginTop: '0.5rem' }} onClick={onDelete}>Delete this tile</button>
    </div>
  )
}

function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const displayName = user?.first_name || user?.username || user?.sub || 'User'

  const { data: prices, loading: lp } = useFetch('/api/market/prices', 60000)
  // Top coins come from Binance volumes (CoinGecko's free tier rate-limits too often to rely on)
  const { data: topData } = useFetch('/api/instruments/top?asset_class=crypto&limit=8', 60000)
  const { data: global } = useFetch('/api/market/global')
  const { data: feargreed, loading: lf } = useFetch('/api/market/fear-greed')

  const [layout, setLayout] = useState(null)
  const [draft, setDraft] = useState(null)        // the layout being edited; null when not editing
  const [saveState, setSaveState] = useState('')
  const [favorites, setFavorites] = useState([])
  const [favPrices, setFavPrices] = useState([])
  const [activity, setActivity] = useState([])
  const [alerts, setAlerts] = useState([])
  const [quotes, setQuotes] = useState({})
  const [names, setNames] = useState(MARKET_LABELS)
  const [decimals, setDecimals] = useState({})
  const dragFrom = useRef(null)

  useEffect(() => {
    api.get('/api/dashboard/layout/').then(setLayout).catch(() => setLayout({ tiles: [], groups: [] }))
  }, [])

  const fetchPersonalData = useCallback(async () => {
    const [favsRes, actRes, alertsRes] = await Promise.allSettled([
      api.get('/api/favorites/'), api.get('/api/activity/?limit=10'), api.get('/api/alerts/'),
    ])
    if (favsRes.status === 'fulfilled') {
      const list = Array.isArray(favsRes.value) ? favsRes.value : favsRes.value?.favorites || []
      setFavPrices(list)
      setFavorites(list.map((f) => f.instrument_id || f.coin_id))
    }
    if (actRes.status === 'fulfilled') setActivity(actRes.value?.items || [])
    if (alertsRes.status === 'fulfilled') {
      const all = Array.isArray(alertsRes.value) ? alertsRes.value : alertsRes.value?.alerts || []
      setAlerts(all.filter((a) => a.active))
    }
  }, [])
  useEffect(() => { fetchPersonalData() }, [fetchPersonalData])

  const shown = draft || layout
  const groupIds = useMemo(() => [...new Set((shown?.groups || []).flatMap((g) => g.ids))].sort().join(','), [shown])

  // Quotes for every instrument in the Markets tiles, refreshed every minute
  useEffect(() => {
    if (!groupIds) return
    const load = () => api.get(`/api/instruments/quotes?ids=${encodeURIComponent(groupIds)}`).then((r) => setQuotes(r.quotes || {})).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [groupIds])

  // Names and price precision for instruments the user added (the defaults have short labels already)
  useEffect(() => {
    const missing = groupIds.split(',').filter((id) => id && !names[id])
    missing.forEach((id) => api.get(`/api/instruments/${encodeURIComponent(id)}`).then((inst) => {
      setNames((n) => ({ ...n, [id]: inst.name }))
      setDecimals((d) => ({ ...d, [id]: inst.price_decimals }))
    }).catch(() => setNames((n) => ({ ...n, [id]: id }))))
  }, [groupIds]) // eslint-disable-line react-hooks/exhaustive-deps -- names only fills in, never needs a refetch

  const toggleFavorite = async (id) => {
    try {
      if (favorites.includes(id)) {
        await api.del(`/api/favorites/${encodeURIComponent(id)}`)
        setFavorites((prev) => prev.filter((f) => f !== id))
        setFavPrices((prev) => prev.filter((f) => (f.instrument_id || f.coin_id) !== id))
      } else {
        await api.post('/api/favorites/', { instrument_id: id })
        setFavorites((prev) => [...prev, id])
        fetchPersonalData()
      }
    } catch { /* the star simply doesn't change */ }
  }

  // ── Editing ────────────────────────────────────────────────────────────
  const startEdit = () => { setDraft(structuredClone(layout)); setSaveState('') }
  const cancelEdit = () => setDraft(null)
  const saveEdit = async () => {
    setSaveState('saving')
    try {
      const saved = await api.put('/api/dashboard/layout/', draft)
      setLayout(saved); setDraft(null); setSaveState('saved')
    } catch (e) {
      setSaveState(`Couldn't save: ${e.message}`)
    }
  }
  const resetLayout = async () => {
    if (!window.confirm('Put the dashboard back to the standard layout? Your own Markets tiles will be removed.')) return
    const fresh = await api.del('/api/dashboard/layout/')
    setLayout(fresh); setDraft(null); setSaveState('saved')
  }
  const setTiles = (fn) => setDraft((d) => ({ ...d, tiles: fn(d.tiles) }))
  const move = (from, to) => setTiles((tiles) => {
    if (to < 0 || to >= tiles.length || from === to) return tiles
    const next = [...tiles]
    const [t] = next.splice(from, 1)
    next.splice(to, 0, t)
    return next
  })
  const patchTile = (i, patch) => setTiles((tiles) => tiles.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const addGroup = () => setDraft((d) => {
    const id = `my${Date.now().toString(36)}`
    return { ...d, groups: [...d.groups, { id, title: 'My instruments', ids: [] }], tiles: [{ id: `group:${id}`, size: 's', hidden: false }, ...d.tiles] }
  })
  const updateGroup = (gid, group, inst) => {
    if (inst) {
      setNames((n) => ({ ...n, [inst.id]: n[inst.id] || inst.name }))
      setDecimals((d) => ({ ...d, [inst.id]: inst.price_decimals }))
    }
    setDraft((d) => ({ ...d, groups: d.groups.map((g) => (g.id === gid ? group : g)) }))
  }
  const deleteGroup = (gid) => setDraft((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== gid), tiles: d.tiles.filter((t) => t.id !== `group:${gid}`) }))

  if ((lp && !prices && !topData) || !shown) return <LoadingSpinner />

  const allCoins = Array.isArray(prices) ? prices : []
  const topCoins = (topData?.results || []).map((r) => {
    const cg = allCoins.find((c) => (c.symbol || '').toUpperCase() === r.symbol)
    return { id: r.id, symbol: r.symbol, name: r.name, image: cg?.image, price: r.quote.price, change: r.quote.change_pct, volume: r.quote.volume }
  })
  const gd = global?.data || global || {}
  const fg = feargreed?.data?.[0] || feargreed || {}
  const editing = !!draft

  const dominance = gd.market_cap_percentage ? Object.entries(gd.market_cap_percentage).slice(0, 6) : []
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#aaa' } } },
    scales: { x: { ticks: { color: '#888' }, grid: { color: '#1a1a2e' } }, y: { ticks: { color: '#888', callback: (v) => fmt(v) }, grid: { color: '#1a1a2e' } } },
  }

  // Each tile: [title, description (its alt text, with the live numbers), body]
  const render = (tile) => {
    if (tile.id.startsWith('group:')) {
      const g = shown.groups.find((x) => `group:${x.id}` === tile.id)
      if (!g) return null
      const rows = g.ids.map((id) => ({ id, name: names[id] || id, q: quotes[id] }))
      const desc = rows.length
        ? `Markets tile "${g.title}": ${rows.map((r) => `${r.name} ${priceText(r.id, r.q, decimals[r.id])}, ${signed(r.q?.change_pct)}`).join('; ')}. Stocks, rates and futures are delayed about 15 minutes.`
        : `Markets tile "${g.title}" has no instruments yet.`
      return [g.title, desc, editing ? (
        <GroupEditor group={g} names={names} onChange={(ng, inst) => updateGroup(g.id, ng, inst)} onDelete={() => deleteGroup(g.id)} />
      ) : rows.length === 0 ? <p className="muted">No instruments. Customize the dashboard to add some.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.3rem 0.75rem', fontSize: '0.9rem' }}>
          {rows.map((r) => [
            <Link key={`${r.id}-n`} to={`/i/${encodeURIComponent(r.id)}`} title={`Open ${r.name}`}>{r.name}</Link>,
            <span key={`${r.id}-p`} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{priceText(r.id, r.q, decimals[r.id])}</span>,
            <span key={`${r.id}-c`} className={tone(r.q?.change_pct)} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.q ? pct(r.q.change_pct) : ''}</span>,
          ])}
        </div>
      )]
    }
    switch (tile.id) {
      case 'stats': {
        const items = [['Market cap', fmt(gd.total_market_cap?.usd)], ['24h volume', fmt(gd.total_volume?.usd)],
          ['BTC dominance', gd.market_cap_percentage?.btc ? `${gd.market_cap_percentage.btc.toFixed(1)}%` : '--'],
          ['Active coins', gd.active_cryptocurrencies?.toLocaleString() || '--']]
        return ['Crypto market stats', `${TILE_INFO.stats[1]} Now: ${items.map(([k, v]) => `${k} ${v}`).join(', ')}.`, (
          <div className="dash-stats">
            {items.map(([k, v]) => (
              <div key={k} className="stat" aria-label={`${k}: ${v}`}><div className="value">{v}</div><div className="label">{k}</div></div>
            ))}
          </div>
        )]
      }
      case 'watchlist':
        return ['Your watchlist', `${TILE_INFO.watchlist[1]} ${favPrices.length} instrument${favPrices.length === 1 ? '' : 's'}.`, favPrices.length === 0 ? (
          <p className="muted">Star an instrument (here, in Top coins or on its page) to watch it.</p>
        ) : (
          <div className="coin-grid" style={{ marginBottom: 0 }}>
            {favPrices.map((fav) => {
              const id = fav.instrument_id || fav.coin_id
              const coin = fav.asset_class === 'crypto' ? allCoins.find((c) => (c.symbol || '').toUpperCase() === fav.symbol) : null
              const p = fav.current_price ?? coin?.current_price
              const isRate = fav.asset_class === 'rate'
              const priceLabel = p != null ? `${isRate || fav.asset_class === 'index' ? '' : '$'}${fmtPrice(p, fav.price_decimals)}${isRate ? '%' : ''}` : '--'
              return <InstrumentCard key={id} id={id} name={fav.name || id} symbol={(fav.symbol || id).toUpperCase()} image={coin?.image}
                priceLabel={priceLabel} change={fav.price_change_24h ?? coin?.price_change_percentage_24h} favorites={favorites} onToggle={toggleFavorite} />
            })}
          </div>
        )]
      case 'top_coins':
        return ['Top coins', `${TILE_INFO.top_coins[1]} ${topCoins.map((c) => `${c.name} $${fmtPrice(c.price)} ${signed(c.change)}`).join('; ')}.`, (
          <div className="coin-grid" style={{ marginBottom: 0 }}>
            {topCoins.map((c) => <InstrumentCard key={c.id} id={c.id} name={c.name} symbol={c.symbol} image={c.image}
              priceLabel={`$${fmtPrice(c.price)}`} change={c.change} favorites={favorites} onToggle={toggleFavorite} />)}
          </div>
        )]
      case 'fear_greed': {
        const v = fg.value ? Number(fg.value) : null
        return ['Fear & Greed index', `${TILE_INFO.fear_greed[1]} Now ${v ?? 'unavailable'}${fg.value_classification ? ` (${fg.value_classification})` : ''}.`,
          lf ? <LoadingSpinner /> : <FearGreedGauge value={v} label={fg.value_classification} />]
      }
      case 'dominance': {
        const text = dominance.map(([k, v]) => `${k.toUpperCase()} ${v.toFixed(1)}%`).join(', ')
        return ['Market dominance', `${TILE_INFO.dominance[1]} ${text || 'No data.'}`, dominance.length === 0 ? <p className="muted">No data.</p> : (
          <div style={{ height: 250 }}>
            <Doughnut aria-label={`Doughnut chart of market dominance: ${text}`} role="img"
              data={{ labels: dominance.map(([k]) => k.toUpperCase()), datasets: [{ data: dominance.map(([, v]) => v), backgroundColor: ['#f7931a', '#627eea', '#14f195', '#e84142', '#2775ca', '#8247e5'], borderWidth: 0 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#aaa' } } } }} />
          </div>
        )]
      }
      case 'volume': {
        const text = topCoins.map((c) => `${c.symbol} ${fmt(c.volume)}`).join(', ')
        return ['24h volume by coin', `${TILE_INFO.volume[1]} ${text || 'No data.'}`, topCoins.length === 0 ? <p className="muted">No data.</p> : (
          <div style={{ height: 250 }}>
            <Bar aria-label={`Bar chart of 24-hour volume: ${text}`} role="img" options={chartOpts}
              data={{ labels: topCoins.map((c) => c.symbol), datasets: [{ label: '24h Volume', data: topCoins.map((c) => c.volume || 0), backgroundColor: '#646cff88', borderColor: '#646cff', borderWidth: 1, borderRadius: 4 }] }} />
          </div>
        )]
      }
      case 'alerts':
        return ['Active alerts', `${TILE_INFO.alerts[1]} ${alerts.length} active.`, alerts.length === 0 ? (
          <p className="muted">No active alerts. <Link to="/alerts">Set one</Link>.</p>
        ) : (
          <div className="alerts-mini-list">
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="alert-mini-item" aria-label={`${a.symbol}: ${a.summary || `${a.direction} ${a.target_price}`}`}>
                <span className="alert-mini-coin">{a.symbol || a.coin_id}</span>
                <span className="alert-mini-dir">{a.summary || `${a.direction} ${a.target_price?.toLocaleString()}`}</span>
              </div>
            ))}
            {alerts.length > 5 && <button type="button" className="btn-link" onClick={() => navigate('/alerts')}>+{alerts.length - 5} more alerts</button>}
          </div>
        )]
      case 'activity':
        return ['Recent activity', `${TILE_INFO.activity[1]} ${activity.length} recent item${activity.length === 1 ? '' : 's'}.`, activity.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="activity-feed" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {activity.map((item, i) => (
              <li key={i} className="activity-item">
                <span className="activity-icon" aria-hidden="true">{ACTIVITY_ICONS[item.type] || '•'}</span>
                <div className="activity-body"><div className="activity-title">{item.title}</div><div className="activity-desc">{item.description}</div></div>
                <span className="activity-time">{timeAgo(item.timestamp)}</span>
              </li>
            ))}
          </ul>
        )]
      case 'quick_actions':
        return ['Quick actions', TILE_INFO.quick_actions[1], (
          <div className="quick-actions-grid">
            {[['/alerts', '🔔', 'Set Alert', 'Create a price, RSI or Stochastic RSI alert'], ['/trades', '⇄', 'Log Trade', 'Record a buy or sell'],
              ['/converter', '💱', 'Convert', 'Convert between currencies and coins'], ['/ai-briefing', '🧠', 'AI Brief', 'Read today\'s AI market briefing'],
              ['/wallet', '💰', 'Wallets', 'See your crypto wallets'], ['/notifications', '🚀', 'In-Play', 'Instruments moving now']].map(([to, icon, label, hint]) => (
              <button key={to} type="button" className="quick-action-btn" onClick={() => navigate(to)} title={hint} aria-label={`${label}: ${hint}`}>
                <span className="qa-icon" aria-hidden="true">{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>
        )]
      default:
        return null
    }
  }

  const tiles = shown.tiles.filter((t) => editing || !t.hidden)
  const hiddenCount = shown.tiles.filter((t) => t.hidden).length

  return (
    <div>
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

      <div className="dash-toolbar" role="toolbar" aria-label="Dashboard layout">
        {!editing ? (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={startEdit}>{'✎'} Customize dashboard</button>
            {hiddenCount > 0 && <span className="muted" style={{ fontSize: '0.8rem' }}>{hiddenCount} tile{hiddenCount === 1 ? '' : 's'} hidden</span>}
            {saveState === 'saved' && <span className="positive" role="status" style={{ fontSize: '0.85rem' }}>Layout saved.</span>}
          </>
        ) : (
          <>
            <strong>Customizing</strong>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Drag tiles or use the arrows to reorder; choose a width; hide what you don't need; edit the instruments in Markets tiles.</span>
            <button type="button" className="btn btn-sm" onClick={addGroup}>+ Add Markets tile</button>
            <button type="button" className="btn btn-sm" onClick={saveEdit} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save layout'}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={cancelEdit}>Cancel</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={resetLayout}>Reset to standard</button>
            {saveState && !['saving', 'saved'].includes(saveState) && <span className="negative" role="alert">{saveState}</span>}
          </>
        )}
      </div>

      <div className="dash-grid">
        {tiles.map((tile) => {
          const content = render(tile)
          if (!content) return null
          const [title, description, body] = content
          const i = shown.tiles.indexOf(tile)
          return (
            <Tile key={tile.id} tile={tile} title={title} description={description} editing={editing} index={i} count={shown.tiles.length}
              onMove={(d) => move(i, i + d)} onSize={(size) => patchTile(i, { size })} onHide={() => patchTile(i, { hidden: !tile.hidden })}
              onDragStart={() => { dragFrom.current = i }} onDrop={() => { if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null }}>
              {body}
            </Tile>
          )
        })}
      </div>
      {tiles.length === 0 && (
        <Card><p className="muted">Every tile is hidden. Select Customize dashboard to show some.</p></Card>
      )}
    </div>
  )
}

export default Dashboard
