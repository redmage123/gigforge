import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/Toast'
import { markInPlaySeen } from '../components/NotificationBell'

const cellStyle = { padding: '0.65rem', borderBottom: '1px solid #1a1a2e', verticalAlign: 'top' }
const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' }

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// $1.2B / $34.5M / $812K / $950
function usdCompact(n) {
  const v = Number(n) || 0
  for (const [div, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (Math.abs(v) >= div) return `$${(v / div).toFixed(1)}${unit}`
  }
  return `$${Math.round(v).toLocaleString()}`
}

// "60 candles of 1h" -> "2.5 days"
function spanText(bars, barSeconds) {
  const hours = (Number(bars) * barSeconds) / 3600
  if (!Number.isFinite(hours) || hours <= 0) return ''
  if (hours < 48) return `${+hours.toFixed(1)} hours`
  const days = hours / 24
  return days < 120 ? `${+days.toFixed(1)} days` : `${+(days / 30.4).toFixed(1)} months`
}

const candleName = (tf) => (tf === '1d' ? 'daily' : tf)

function Headline({ h, muted }) {
  return (
    <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ color: muted ? '#94a3b8' : '#7dd3fc', fontSize: '0.85rem' }}>
      {h.title} <span className="muted">({h.source})</span>
    </a>
  )
}

function Catalyst({ catalyst }) {
  if (!catalyst) return <span className="muted" style={{ fontSize: '0.85rem' }}>Checking news…</span>
  const real = catalyst.headlines.filter((h) => h.kind !== 'price_action')
  const coverage = catalyst.headlines.filter((h) => h.kind === 'price_action')
  const others = catalyst.ai_summary ? catalyst.headlines.filter((h) => h.kind !== 'price_action') : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title={`Checked: ${catalyst.checked}`}>
      {catalyst.ai_summary ? (
        <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
          <span className="badge badge-purple" style={{ marginRight: 6 }}>AI</span>{catalyst.ai_summary}
        </span>
      ) : catalyst.found
        ? real.slice(0, 3).map((h, i) => <Headline key={i} h={h} />)
        : <span style={{ color: '#f59e0b' }}>No news catalyst found</span>}
      {!catalyst.ai_summary && catalyst.found && real.length > 3 && (
        <details>
          <summary className="muted" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>{real.length - 3} more</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {real.slice(3).map((h, i) => <Headline key={i} h={h} />)}
          </div>
        </details>
      )}
      {others.length > 0 && (
        <details>
          <summary className="muted" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>Sources ({others.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {others.map((h, i) => <Headline key={i} h={h} />)}
          </div>
        </details>
      )}
      {coverage.length > 0 && (
        <details>
          <summary className="muted" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>Price-move coverage ({coverage.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {coverage.map((h, i) => <Headline key={i} h={h} muted />)}
          </div>
        </details>
      )}
    </div>
  )
}

function useNarrow() {
  const query = '(max-width: 760px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

function MoveBadge({ e }) {
  const bull = e.direction === 'bullish'
  return (
    <>
      <span className={`badge ${bull ? 'badge-green' : 'badge-red'}`} style={{ whiteSpace: 'nowrap' }}>{bull ? '▲ Bullish' : '▼ Bearish'}</span>
      <span style={{ color: bull ? '#4ade80' : '#f87171', fontFamily: 'monospace', marginLeft: 6 }}>
        {e.change_pct > 0 ? '+' : ''}{e.change_pct.toFixed(1)}%
      </span>
    </>
  )
}

// Phone-width layout: one stacked card per coin instead of a wide table
function InPlayList({ entries }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((e) => (
        <div key={e.symbol} style={{ padding: '0.75rem 0', borderBottom: '1px solid #1a1a2e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#e0e0e0', fontWeight: 700 }}>
              {e.base} <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>{e.catalyst?.coin_name}</span>
            </span>
            <span className="muted" style={{ fontSize: '0.8rem' }}>{timeAgo(e.triggered_at)}</span>
          </div>
          <div style={{ margin: '0.35rem 0' }}><MoveBadge e={e} /></div>
          <div className="muted" style={{ fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
            Vol {usdCompact(e.quote_volume)} ({e.volume_ratio.toFixed(1)}x) · Candle {e.range_ratio.toFixed(1)}x · Body {Math.round(e.body_pct)}% · {e.candle_label || e.candle_date}{e.candle_forming ? ' (live)' : ''}
            {e.hits > 1 ? ` · ${e.hits} triggers` : ''}
          </div>
          <Catalyst catalyst={e.catalyst} />
        </div>
      ))}
    </div>
  )
}

const RULE_FIELDS = [
  { key: 'volume_mult', label: 'Volume more than', suffix: 'x avg', step: 0.5, help: 'Candle volume vs the volume average below' },
  { key: 'range_mult', label: 'Candle size more than', suffix: 'x avg', step: 0.5, help: 'High-to-low range vs the price average below' },
  { key: 'max_wick_pct', label: 'Opposing wick at most', suffix: '% of candle', step: 5, help: 'Top wick on bullish, bottom wick on bearish' },
  { key: 'min_body_pct', label: 'Body at least', suffix: '% of candle', step: 5, help: 'Open-to-close vs high-to-low; filters spiky candles that went nowhere' },
]

const SETTING_KEYS = ['timeframe', 'volume_lookback', 'price_lookback', 'retention_days']

function RulesEditor({ data, onSaved }) {
  const toast = useToast()
  const [draft, setDraft] = useState(data.rules)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(data.rules), [data.rules])

  const tfInfo = data.timeframes.find((t) => t.value === draft.timeframe) || data.timeframes.find((t) => t.value === '1d')
  const maxLb = tfInfo.max_lookback
  const [minDays, maxDays] = data.retention_range
  const dirty = RULE_FIELDS.some((f) => Number(draft[f.key]) !== data.rules[f.key])
    || SETTING_KEYS.some((k) => String(draft[k]) !== String(data.rules[k]))

  // Keep the averaging periods inside what the chosen timeframe supports
  const setTimeframe = (tf) => {
    const top = data.timeframes.find((t) => t.value === tf).max_lookback
    setDraft({
      ...draft, timeframe: tf,
      volume_lookback: Math.min(Number(draft.volume_lookback), top),
      price_lookback: Math.min(Number(draft.price_lookback), top),
    })
  }

  const save = async (rules) => {
    setSaving(true)
    try {
      const body = Object.fromEntries(RULE_FIELDS.map((f) => [f.key, Number(rules[f.key])]))
      body.timeframe = rules.timeframe
      body.volume_lookback = Math.round(Number(rules.volume_lookback))
      body.price_lookback = Math.round(Number(rules.price_lookback))
      body.retention_days = Math.round(Number(rules.retention_days))
      const res = await api.put('/api/in-play/rules', body)
      onSaved(res)
      toast.success(res.profile_ready
        ? `Rules saved: ${res.entries.length} coins match in the last ${res.rules.retention_days} days`
        : `Rules saved. Building ${candleName(res.rules.timeframe)} candle history; the list fills in within a few minutes.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', color: '#cbd5e1', minWidth: 0 }

  return (
    <Card title="Alert Rules">
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Threshold changes apply to your list straight away (without re-sending old alerts) and to every new move.
        A new timeframe or averaging period first rebuilds {data.rules.retention_days} days of history, which takes a few minutes.
      </p>
      <h4 style={{ color: '#e2e8f0', margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Timeframe and averages</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <label style={labelStyle} htmlFor="ip-timeframe">
          Candle timeframe
          <select id="ip-timeframe" className="input" value={draft.timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {data.timeframes.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Every {candleName(draft.timeframe)} candle is checked against the rules</span>
        </label>
        {[
          ['volume_lookback', 'Volume average over', 'Average volume of the previous candles'],
          ['price_lookback', 'Price average over', 'Average candle size (high to low) of the previous candles'],
        ].map(([key, label, help]) => (
          <label key={key} style={labelStyle} htmlFor={`ip-${key}`}>
            {label} (candles)
            <input
              id={`ip-${key}`}
              className="input"
              type="number"
              inputMode="numeric"
              step={1}
              min={data.lookback_min}
              max={maxLb}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <span className="muted" style={{ fontSize: '0.75rem' }}>
              {help}: {spanText(draft[key], tfInfo.bar_seconds)} on {draft.timeframe} ({data.lookback_min}-{maxLb})
            </span>
          </label>
        ))}
        <label style={labelStyle} htmlFor="ip-retention">
          Keep coins on the list for (days)
          <input
            id="ip-retention"
            className="input"
            type="number"
            inputMode="numeric"
            step={1}
            min={minDays}
            max={maxDays}
            value={draft.retention_days}
            onChange={(e) => setDraft({ ...draft, retention_days: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <span className="muted" style={{ fontSize: '0.75rem' }}>A coin drops off this many days after it last triggered ({minDays}-{maxDays})</span>
        </label>
      </div>
      <h4 style={{ color: '#e2e8f0', margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Candle rules</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {RULE_FIELDS.map((f) => (
          <label key={f.key} style={labelStyle} htmlFor={`ip-${f.key}`}>
            {f.label} ({f.suffix})
            <input
                id={`ip-${f.key}`}
                className="input"
                type="number"
                inputMode="decimal"
                step={f.step}
                min={data.floors[f.key] ?? 0}
                max={f.key.endsWith('pct') ? 100 : undefined}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            <span className="muted" style={{ fontSize: '0.75rem' }}>{f.help}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn" disabled={!dirty || saving} onClick={() => save(draft)}>{saving ? 'Saving...' : 'Save rules'}</button>
        <button className="btn btn-outline" disabled={saving} onClick={() => save(data.defaults)}>Reset to defaults</button>
      </div>
    </Card>
  )
}

function PhoneAlerts() {
  const toast = useToast()
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/in-play/phone').then((res) => {
      setCfg({ ...res, ntfy_topic: res.ntfy_topic || res.suggested_topic })
    }).catch((err) => toast.error(err.message))
  }, [])

  if (!cfg) return null

  const save = async (enabled = cfg.enabled) => {
    setSaving(true)
    try {
      await api.put('/api/in-play/phone', { enabled, ntfy_topic: cfg.ntfy_topic.trim(), ntfy_server: cfg.ntfy_server })
      setCfg({ ...cfg, enabled })
      toast.success(enabled ? 'Phone alerts on' : 'Phone alerts off')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    try {
      await api.post('/api/in-play/phone/test', {})
      toast.success('Test sent — check your phone')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Card title="Phone Alerts">
      <ol style={{ color: '#cbd5e1', fontSize: '0.9rem', paddingLeft: '1.2rem', margin: '0 0 1rem' }}>
        <li>Install the free <strong>ntfy</strong> app (iOS App Store / Google Play).</li>
        <li>In the app tap <strong>+</strong> and subscribe to the topic below (server: ntfy.sh).</li>
        <li>Turn alerts on and send a test.</li>
      </ol>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: '1 1 260px', fontFamily: 'monospace' }}
          value={cfg.ntfy_topic}
          onChange={(e) => setCfg({ ...cfg, ntfy_topic: e.target.value })}
          aria-label="ntfy topic"
        />
        <button className="btn" disabled={saving} onClick={() => save(!cfg.enabled)}>
          {cfg.enabled ? 'Turn off' : 'Turn on'}
        </button>
        {cfg.enabled && <button className="btn btn-secondary" disabled={saving} onClick={() => save(true)}>Save topic</button>}
        <button className="btn btn-outline" onClick={test} disabled={!cfg.enabled}>Send test</button>
      </div>
      <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
        Status: {cfg.enabled ? 'on' : 'off'}. Anyone who knows the topic can read it, so keep it random.
      </div>
    </Card>
  )
}

export default function Notifications() {
  const [inPlay, setInPlay] = useState(null)
  const [notifs, setNotifs] = useState([])
  const [error, setError] = useState('')
  const narrow = useNarrow()

  const load = async () => {
    try {
      const [ip, n] = await Promise.all([api.get('/api/in-play/'), api.get('/api/notifications/')])
      setInPlay(ip)
      setNotifs(n.notifications || [])
      markInPlaySeen(ip.entries)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const building = inPlay && !inPlay.profile_ready
  useEffect(() => {
    load()
    // Poll faster while the scanner builds history for a newly chosen timeframe
    const id = setInterval(load, building ? 15000 : 60000)
    return () => clearInterval(id)
  }, [building])

  const markAllRead = async () => {
    await api.post('/api/notifications/read', {})
    load()
  }

  if (!inPlay && !error) return <LoadingSpinner />

  const rules = inPlay?.rules
  const entries = inPlay?.entries || []
  const onRulesSaved = (res) => setInPlay({ ...inPlay, ...res })

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1rem' }}>Notifications</h2>
      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title={`In-Play Coins (${entries.length}/${inPlay?.max_entries ?? 25})`}>
        {rules && (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            {candleName(rules.timeframe).replace(/^./, (c) => c.toUpperCase())} candle with volume &gt;{rules.volume_mult}x the average of the
            previous {rules.volume_lookback} candles and size &gt;{rules.range_mult}x the average of the previous {rules.price_lookback},
            body ≥ {rules.min_body_pct}% and opposing wick ≤ {rules.max_wick_pct}% of the candle. Kept {rules.retention_days} days, newest first.
            {inPlay.last_scan && <> Last scan {timeAgo(inPlay.last_scan)} across {inPlay.symbols_scanned} Binance USDT pairs.</>}
            {!inPlay.ai_summaries && <> AI catalyst summaries are off (no API key configured).</>}
          </p>
        )}
        {building && (
          <div role="status" style={{ padding: '0.6rem 0.8rem', marginBottom: '0.75rem', borderRadius: 8, background: '#1e293b', color: '#cbd5e1', fontSize: '0.85rem' }}>
            Building {candleName(rules.timeframe)} candle history for your settings. The list fills in within a few minutes; this page refreshes by itself.
          </div>
        )}
        {entries.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center' }}>
            {building ? 'Waiting for the first scan of your timeframe…'
              : `No coins match your rules in the last ${rules?.retention_days ?? 14} days. The scanner runs every 15 minutes; try loosening the rules below.`}
          </p>
        ) : narrow ? (
          <InPlayList entries={entries} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Coin', 'Move', 'Volume', 'Candle', 'Triggered', 'News catalyst'].map((h) => (
                    <th key={h} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const bull = e.direction === 'bullish'
                  return (
                    <tr key={e.symbol}>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>
                        {e.base}
                        {e.catalyst?.coin_name && <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 400 }}>{e.catalyst.coin_name}</div>}
                      </td>
                      <td style={cellStyle}>
                        <span className={`badge ${bull ? 'badge-green' : 'badge-red'}`} style={{ whiteSpace: 'nowrap' }}>{bull ? '▲ Bullish' : '▼ Bearish'}</span>
                        <div style={{ color: bull ? '#4ade80' : '#f87171', fontFamily: 'monospace', marginTop: 4 }}>
                          {e.change_pct > 0 ? '+' : ''}{e.change_pct.toFixed(1)}%
                        </div>
                      </td>
                      <td style={{ ...cellStyle, color: '#f59e0b', fontFamily: 'monospace' }}>
                        {usdCompact(e.quote_volume)}
                        <div style={{ fontSize: '0.75rem' }}>{e.volume_ratio.toFixed(1)}x avg</div>
                        {e.avg_quote_volume > 0 && <div className="muted" style={{ fontSize: '0.75rem' }}>avg {usdCompact(e.avg_quote_volume)}</div>}
                      </td>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>
                        {e.range_ratio.toFixed(1)}x
                        <div className="muted" style={{ fontSize: '0.75rem' }}>body {Math.round(e.body_pct)}%</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{e.candle_label || e.candle_date}{e.candle_forming ? ' (live)' : ''}</div>
                      </td>
                      <td style={{ ...cellStyle, color: '#aaa', whiteSpace: 'nowrap' }}>
                        {timeAgo(e.triggered_at)}
                        {e.hits > 1 && <div className="muted" style={{ fontSize: '0.75rem' }}>{e.hits} triggers</div>}
                      </td>
                      <td style={cellStyle}><Catalyst catalyst={e.catalyst} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inPlay && <div style={{ marginTop: '1rem' }}><RulesEditor data={inPlay} onSaved={onRulesSaved} /></div>}

      <div style={{ marginTop: '1rem' }}><PhoneAlerts /></div>

      <div style={{ marginTop: '1rem' }}>
        <Card title="Other Notifications">
          {notifs.length === 0 ? (
            <p className="muted">Nothing here yet. Price alerts from <Link to="/alerts">Alerts</Link> show up here.</p>
          ) : (
            <>
              <button className="btn btn-sm btn-ghost" onClick={markAllRead} style={{ marginBottom: '0.5rem' }}>Mark all read</button>
              {notifs.map((n) => (
                <div key={n.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1a1a2e', opacity: n.read ? 0.6 : 1 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{n.title}</div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>{n.message} · {timeAgo(n.timestamp)}</div>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
