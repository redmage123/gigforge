import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

const COINS = [
  'bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot',
  'avalanche-2', 'chainlink', 'dogecoin', 'ripple', 'uniswap',
]

const ACTION_COLORS = {
  'Strong Buy': '#00d4aa',
  'Buy': '#4ade80',
  'Hold': '#facc15',
  'Sell': '#fb923c',
  'Strong Sell': '#ff6b6b',
}

const ACTION_BG = {
  'Strong Buy': 'rgba(0,212,170,0.12)',
  'Buy': 'rgba(74,222,128,0.12)',
  'Hold': 'rgba(250,204,21,0.12)',
  'Sell': 'rgba(251,146,60,0.12)',
  'Strong Sell': 'rgba(255,107,107,0.12)',
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getSentimentColor(val) {
  if (val >= 50) return '#00d4aa'
  if (val >= 20) return '#4ade80'
  if (val > -20) return '#facc15'
  if (val > -50) return '#fb923c'
  return '#ff6b6b'
}

function SentimentBadge({ score, label }) {
  const color = getSentimentColor(score)
  return (
    <span style={{
      background: `${color}22`,
      color,
      padding: '0.2rem 0.6rem',
      borderRadius: 12,
      fontSize: '0.8rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label || score}
    </span>
  )
}

function SignalBar({ label, score }) {
  const pct = ((score + 1) / 2) * 100
  const color = score > 0.1 ? '#4ade80' : score < -0.1 ? '#ff6b6b' : '#facc15'
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
        <span style={{ color: '#94a3b8' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{(score * 100).toFixed(0)}%</span>
      </div>
      <div style={{ background: '#1a1a2e', borderRadius: 4, height: 6, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: '#333' }} />
        <div style={{
          position: 'absolute',
          left: score >= 0 ? '50%' : `${pct}%`,
          width: `${Math.abs(score) * 50}%`,
          height: '100%',
          background: color,
          borderRadius: 4,
          transition: 'all 0.5s ease',
        }} />
      </div>
    </div>
  )
}

const selectStyle = {
  padding: '0.5rem 0.75rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.9rem',
  width: '100%',
}

const inputStyle = {
  ...selectStyle,
}

const textareaStyle = {
  ...selectStyle,
  minHeight: 80,
  resize: 'vertical',
  fontFamily: 'inherit',
}

// --- Profile Setup Component ---
function ProfileSetup({ profile, options, onSave, saving }) {
  const [form, setForm] = useState(profile || {})

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleCoinsChange = (key, val) => {
    const coins = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    set(key, coins)
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Risk + Strategy row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Card title="Risk Tolerance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {options?.risk_levels && Object.entries(options.risk_levels).map(([key, val]) => (
              <label
                key={key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: 8, cursor: 'pointer',
                  background: form.risk_tolerance === key ? '#646cff18' : '#12121f',
                  border: form.risk_tolerance === key ? '1px solid #646cff' : '1px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="radio"
                  name="risk"
                  checked={form.risk_tolerance === key}
                  onChange={() => set('risk_tolerance', key)}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{val.label}</div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{val.description}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Investment Strategy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {options?.strategies && Object.entries(options.strategies).map(([key, val]) => (
              <label
                key={key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: 8, cursor: 'pointer',
                  background: form.strategy === key ? '#646cff18' : '#12121f',
                  border: form.strategy === key ? '1px solid #646cff' : '1px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="radio"
                  name="strategy"
                  checked={form.strategy === key}
                  onChange={() => set('strategy', key)}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{val.label}</div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{val.description}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>
      </div>

      {/* Goal + Horizon row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Card title="Portfolio Goal">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {options?.portfolio_goals && Object.entries(options.portfolio_goals).map(([key, val]) => (
              <label
                key={key}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: 8, cursor: 'pointer',
                  background: form.portfolio_goal === key ? '#646cff18' : '#12121f',
                  border: form.portfolio_goal === key ? '1px solid #646cff' : '1px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="radio"
                  name="goal"
                  checked={form.portfolio_goal === key}
                  onChange={() => set('portfolio_goal', key)}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{val.label}</div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{val.description}</div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Card title="Time Horizon">
            <select
              value={form.time_horizon || 'medium'}
              onChange={e => set('time_horizon', e.target.value)}
              style={selectStyle}
            >
              {options?.time_horizons && Object.entries(options.time_horizons).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </Card>

          <Card title="Target Annual Return">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={form.target_return_pct || 50}
                onChange={e => set('target_return_pct', parseInt(e.target.value))}
                style={{ flex: 1, accentColor: '#646cff' }}
              />
              <span style={{ color: '#e2e8f0', fontWeight: 700, minWidth: 50, textAlign: 'right' }}>
                {form.target_return_pct || 50}%
              </span>
            </div>
          </Card>

          <Card title="Monthly Investment Budget">
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>$</span>
              <input
                type="number"
                min="0"
                step="50"
                value={form.monthly_investment || ''}
                onChange={e => set('monthly_investment', parseFloat(e.target.value) || 0)}
                placeholder="0 (not set)"
                style={{ ...inputStyle, paddingLeft: '1.5rem' }}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Coin preferences */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Card title="Preferred Coins">
          <input
            type="text"
            value={(form.preferred_coins || []).join(', ')}
            onChange={e => handleCoinsChange('preferred_coins', e.target.value)}
            placeholder="e.g. bitcoin, ethereum, solana"
            style={inputStyle}
          />
          <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>
            Coins you want prioritized in recommendations (comma-separated CoinGecko IDs)
          </div>
        </Card>

        <Card title="Coins to Avoid">
          <input
            type="text"
            value={(form.avoid_coins || []).join(', ')}
            onChange={e => handleCoinsChange('avoid_coins', e.target.value)}
            placeholder="e.g. dogecoin, shiba-inu"
            style={inputStyle}
          />
          <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>
            Coins you want excluded from recommendations
          </div>
        </Card>
      </div>

      {/* Notes */}
      <Card title="Investment Thesis / Notes">
        <textarea
          value={form.notes || ''}
          onChange={e => set('notes', e.target.value)}
          placeholder="Describe your investment philosophy, specific goals, or anything the advisor should consider..."
          style={textareaStyle}
        />
      </Card>

      <button
        className="btn btn-primary"
        onClick={() => onSave(form)}
        disabled={saving}
        style={{ justifySelf: 'start', padding: '0.75rem 2rem', fontSize: '1rem' }}
      >
        {saving ? 'Saving...' : 'Save Strategy Profile'}
      </button>
    </div>
  )
}

// --- Profile Summary Banner ---
function ProfileBanner({ profile, options, onEditClick }) {
  if (!profile?.completed) {
    return (
      <div className="card" style={{
        padding: '1.25rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, #646cff12, #7b61ff12)',
        border: '1px solid #646cff33',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1.05rem' }}>
              Set up your investment profile
            </div>
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Tell the advisor about your goals, risk tolerance, and strategy so recommendations align with what you're trying to achieve.
            </div>
          </div>
          <button className="btn btn-primary" onClick={onEditClick}>
            Set Up Profile
          </button>
        </div>
      </div>
    )
  }

  const riskLabel = options?.risk_levels?.[profile.risk_tolerance]?.label || profile.risk_tolerance
  const strategyLabel = options?.strategies?.[profile.strategy]?.label || profile.strategy
  const goalLabel = options?.portfolio_goals?.[profile.portfolio_goal]?.label || profile.portfolio_goal
  const horizonLabel = options?.time_horizons?.[profile.time_horizon]?.label || profile.time_horizon

  return (
    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag color="#646cff">{strategyLabel}</Tag>
          <Tag color="#7b61ff">{riskLabel} Risk</Tag>
          <Tag color="#4ecdc4">{goalLabel}</Tag>
          <Tag color="#ffd93d">{horizonLabel}</Tag>
          {profile.target_return_pct > 0 && (
            <Tag color="#00d4aa">Target: {profile.target_return_pct}% / yr</Tag>
          )}
        </div>
        <button className="btn-link" style={{ fontSize: '0.8rem' }} onClick={onEditClick}>
          Edit Strategy
        </button>
      </div>
    </div>
  )
}

function Tag({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      color,
      padding: '0.2rem 0.6rem',
      borderRadius: 8,
      fontSize: '0.78rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// --- Main Component ---
export default function Sentiment() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('recommendations')
  const [recommendations, setRecommendations] = useState(null)
  const [news, setNews] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [marketSentiment, setMarketSentiment] = useState(null)
  const [fearGreed, setFearGreed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newsFilter, setNewsFilter] = useState('')
  const [expandedRec, setExpandedRec] = useState(null)
  const [profileCompleted, setProfileCompleted] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileOptions, setProfileOptions] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [recRes, newsRes, alertsRes, profileRes] = await Promise.allSettled([
        api.get('/api/sentiment-advisor/recommendations'),
        api.get('/api/sentiment-advisor/news?limit=40'),
        api.get('/api/sentiment-advisor/alerts'),
        api.get('/api/sentiment-advisor/profile'),
      ])

      if (recRes.status === 'fulfilled') {
        setRecommendations(recRes.value.recommendations || [])
        setMarketSentiment(recRes.value.market_sentiment || null)
        setFearGreed(recRes.value.fear_greed)
        setProfileCompleted(recRes.value.profile_completed || false)
      }
      if (newsRes.status === 'fulfilled') {
        setNews(newsRes.value.articles || [])
      }
      if (alertsRes.status === 'fulfilled') {
        setAlerts(alertsRes.value.alerts || [])
      }
      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value.profile || null)
        setProfileOptions(profileRes.value.options || null)
        if (profileRes.value.profile?.completed) {
          setProfileCompleted(true)
        }
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const interval = setInterval(fetchData, 300000)
    return () => clearInterval(interval)
  }, [fetchData])

  const saveProfile = async (formData) => {
    setSavingProfile(true)
    try {
      const res = await api.post('/api/sentiment-advisor/profile', formData)
      if (res.profile) {
        setProfile(res.profile)
        setProfileCompleted(true)
      }
      // Re-fetch recommendations with updated profile
      setTab('recommendations')
      fetchData()
    } catch {}
    setSavingProfile(false)
  }

  const markAlertRead = async (timestamp) => {
    try {
      await api.post(`/api/sentiment-advisor/alerts/${timestamp}/read`)
      setAlerts(prev => prev.map(a => a.timestamp === timestamp ? { ...a, read: true } : a))
    } catch {}
  }

  if (loading && !recommendations) return <LoadingSpinner />

  const unreadAlerts = alerts.filter(a => !a.read)

  const filteredNews = newsFilter
    ? (news || []).filter(a => a.coin_tags?.includes(newsFilter))
    : (news || [])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>AI Sentiment Advisor</h2>
        {unreadAlerts.length > 0 && (
          <span style={{
            background: '#ff6b6b22', color: '#ff6b6b',
            padding: '0.3rem 0.8rem', borderRadius: 12,
            fontSize: '0.85rem', fontWeight: 600,
          }}>
            {unreadAlerts.length} new alert{unreadAlerts.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Profile banner (show setup prompt or current strategy summary) */}
      {tab !== 'strategy' && (
        <ProfileBanner
          profile={profile}
          options={profileOptions}
          onEditClick={() => setTab('strategy')}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'recommendations', label: 'Recommendations' },
          { id: 'news', label: 'News Feed' },
          { id: 'alerts', label: `Alerts${unreadAlerts.length ? ` (${unreadAlerts.length})` : ''}` },
          { id: 'strategy', label: profileCompleted ? 'Your Strategy' : 'Set Up Strategy' },
        ].map(t => (
          <button
            key={t.id}
            className={`period-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ padding: '0.5rem 1.2rem' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Market Overview Bar */}
      {tab !== 'strategy' && marketSentiment && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Market Sentiment</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: getSentimentColor(marketSentiment.overall_score) }}>
              {marketSentiment.overall_score}
            </div>
            <div style={{ color: getSentimentColor(marketSentiment.overall_score), fontSize: '0.8rem' }}>
              {marketSentiment.label}
            </div>
          </div>
          {fearGreed != null && (
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Fear & Greed</div>
              <div style={{
                fontSize: '1.5rem', fontWeight: 700,
                color: fearGreed <= 25 ? '#ff6b6b' : fearGreed <= 45 ? '#fb923c' : fearGreed <= 55 ? '#facc15' : fearGreed <= 75 ? '#4ade80' : '#00d4aa',
              }}>
                {fearGreed}
              </div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {fearGreed <= 25 ? 'Extreme Fear' : fearGreed <= 45 ? 'Fear' : fearGreed <= 55 ? 'Neutral' : fearGreed <= 75 ? 'Greed' : 'Extreme Greed'}
              </div>
            </div>
          )}
          {marketSentiment.distribution && (
            <>
              <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Bullish Articles</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ade80' }}>{marketSentiment.distribution.bullish}</div>
              </div>
              <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Bearish Articles</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ff6b6b' }}>{marketSentiment.distribution.bearish}</div>
              </div>
            </>
          )}
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Articles Scanned</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>{marketSentiment.article_count || 0}</div>
          </div>
        </div>
      )}

      {/* === STRATEGY TAB === */}
      {tab === 'strategy' && (
        <ProfileSetup
          profile={profile}
          options={profileOptions}
          onSave={saveProfile}
          saving={savingProfile}
        />
      )}

      {/* === RECOMMENDATIONS TAB === */}
      {tab === 'recommendations' && (
        <div>
          {(!recommendations || recommendations.length === 0) ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <p>Scanning news sources and analyzing sentiment...</p>
                <p style={{ fontSize: '0.85rem' }}>Recommendations will appear after the first news scan completes (up to 15 minutes).</p>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {recommendations.map((rec) => (
                <div
                  key={rec.coin_id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    borderLeft: `4px solid ${ACTION_COLORS[rec.action] || '#666'}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedRec(expandedRec === rec.coin_id ? null : rec.coin_id)}
                >
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    {rec.image && (
                      <img src={rec.image} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: '#e2e8f0', fontSize: '1.05rem' }}>{rec.name}</strong>
                        {rec.symbol && <span className="muted">({rec.symbol})</span>}
                      </div>
                      {rec.current_price != null && (
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          ${rec.current_price.toLocaleString()}
                        </div>
                      )}
                    </div>

                    {/* Action badge */}
                    <div style={{
                      background: ACTION_BG[rec.action] || '#333',
                      color: ACTION_COLORS[rec.action] || '#aaa',
                      padding: '0.5rem 1.2rem',
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: '1rem',
                      textAlign: 'center',
                      minWidth: 110,
                    }}>
                      {rec.action}
                    </div>

                    {/* Confidence */}
                    <div style={{ textAlign: 'center', minWidth: 70 }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>{rec.confidence}%</div>
                      <div className="muted" style={{ fontSize: '0.7rem' }}>Confidence</div>
                    </div>

                    {/* Sentiment trend */}
                    <div style={{ textAlign: 'center', minWidth: 80 }}>
                      <SentimentBadge
                        score={rec.sentiment_detail?.overall_score || 0}
                        label={rec.signals?.sentiment?.label || 'N/A'}
                      />
                      <div className="muted" style={{ fontSize: '0.7rem', marginTop: '0.2rem' }}>
                        {rec.signals?.sentiment?.trend || 'stable'}
                      </div>
                    </div>
                  </div>

                  {/* Rationale — always visible */}
                  {rec.rationale && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.6rem 0.8rem',
                      background: '#12121f',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      color: '#94a3b8',
                      lineHeight: 1.5,
                      borderLeft: `3px solid ${ACTION_COLORS[rec.action] || '#666'}44`,
                    }}>
                      {rec.rationale}
                    </div>
                  )}

                  {/* Expanded signal breakdown */}
                  {expandedRec === rec.coin_id && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #1f2937' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <h4 style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Signal Breakdown</h4>
                          {rec.signals && Object.entries(rec.signals).map(([key, sig]) => (
                            <SignalBar
                              key={key}
                              label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              score={sig.score}
                            />
                          ))}
                        </div>
                        <div>
                          <h4 style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Details</h4>
                          <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.8 }}>
                            <div>Composite Score: <strong style={{ color: '#e2e8f0' }}>{rec.composite_score}</strong></div>
                            <div>Strategy: <strong style={{ color: '#e2e8f0' }}>
                              {profileOptions?.strategies?.[rec.strategy_applied]?.label || rec.strategy_applied}
                            </strong></div>
                            <div>Risk Level: <strong style={{ color: '#e2e8f0' }}>
                              {profileOptions?.risk_levels?.[rec.risk_level]?.label || rec.risk_level}
                            </strong></div>
                            <div>Sentiment Articles: <strong style={{ color: '#e2e8f0' }}>{rec.signals?.sentiment?.article_count || 0}</strong></div>
                            <div>24h Change: <strong style={{
                              color: (rec.signals?.price_trend?.change_24h || 0) >= 0 ? '#4ade80' : '#ff6b6b'
                            }}>
                              {rec.signals?.price_trend?.change_24h != null
                                ? `${rec.signals.price_trend.change_24h >= 0 ? '+' : ''}${rec.signals.price_trend.change_24h.toFixed(2)}%`
                                : '--'}
                            </strong></div>
                            <div>Fear & Greed: <strong style={{ color: '#e2e8f0' }}>{rec.signals?.fear_greed?.value ?? '--'}</strong></div>
                          </div>
                          <button
                            className="btn btn-sm btn-outline"
                            style={{ marginTop: '0.75rem' }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/coin/${rec.coin_id}`) }}
                          >
                            View Charts
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === NEWS FEED TAB === */}
      {tab === 'news' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button
              className={`period-btn ${!newsFilter ? 'active' : ''}`}
              onClick={() => setNewsFilter('')}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
            >
              All
            </button>
            {COINS.slice(0, 6).map(c => (
              <button
                key={c}
                className={`period-btn ${newsFilter === c ? 'active' : ''}`}
                onClick={() => setNewsFilter(c)}
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
              >
                {c.replace('-2', '').charAt(0).toUpperCase() + c.replace('-2', '').slice(1)}
              </button>
            ))}
          </div>

          {(!filteredNews || filteredNews.length === 0) ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <p>No articles found yet. The scanner runs every 15 minutes.</p>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredNews.map((article, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    borderLeft: `3px solid ${getSentimentColor(article.sentiment_score)}`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, lineHeight: 1.4 }}
                    >
                      {article.title}
                    </a>
                    {article.summary && (
                      <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem', lineHeight: 1.4 }}>
                        {article.summary}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="muted" style={{ fontSize: '0.75rem' }}>{article.source}</span>
                      <span className="muted" style={{ fontSize: '0.75rem' }}>{timeAgo(article.published_ts)}</span>
                      {article.coin_tags?.map(tag => (
                        <span key={tag} style={{
                          background: '#1f293766', color: '#94a3b8',
                          padding: '0.1rem 0.4rem', borderRadius: 6, fontSize: '0.7rem',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <SentimentBadge score={article.sentiment_score} label={article.sentiment_label} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === ALERTS TAB === */}
      {tab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <p>No sentiment alerts yet.</p>
                <p style={{ fontSize: '0.85rem' }}>
                  Alerts are generated when a coin's sentiment shifts significantly (25+ points).
                  The system checks every 5 minutes.
                </p>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.map((alert, i) => {
                const isBullish = alert.direction === 'bullish'
                const color = isBullish ? '#4ade80' : '#ff6b6b'
                const arrow = isBullish ? '\u2191' : '\u2193'
                return (
                  <div
                    key={i}
                    className="card"
                    style={{
                      padding: '1rem 1.25rem',
                      borderLeft: `3px solid ${color}`,
                      opacity: alert.read ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.5rem', color }}>{arrow}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ color: '#e2e8f0' }}>
                            {alert.coin_id?.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </strong>
                          <span style={{ color, fontWeight: 600 }}>
                            {isBullish ? 'Bullish' : 'Bearish'} Shift
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                          Sentiment moved {alert.shift > 0 ? '+' : ''}{alert.shift} points
                          ({alert.previous_score} {'\u2192'} {alert.current_score})
                          {' \u2022 '}{alert.article_count} articles analyzed
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{timeAgo(alert.timestamp)}</div>
                        {!alert.read && (
                          <button className="btn-link" style={{ fontSize: '0.75rem' }} onClick={() => markAlertRead(alert.timestamp)}>
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
