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
            Vol {e.volume_ratio.toFixed(1)}x · Candle {e.range_ratio.toFixed(1)}x · Body {Math.round(e.body_pct)}% · {e.candle_date}{e.candle_forming ? ' (live)' : ''}
            {e.hits > 1 ? ` · ${e.hits} triggers` : ''}
          </div>
          <Catalyst catalyst={e.catalyst} />
        </div>
      ))}
    </div>
  )
}

const RULE_FIELDS = [
  { key: 'volume_mult', label: 'Volume more than', suffix: 'x avg', step: 0.5, help: 'Candle volume vs the 60-day average' },
  { key: 'range_mult', label: 'Candle size more than', suffix: 'x avg', step: 0.5, help: 'High-to-low range vs the 60-day average' },
  { key: 'max_wick_pct', label: 'Opposing wick at most', suffix: '% of candle', step: 5, help: 'Top wick on bullish, bottom wick on bearish' },
  { key: 'min_body_pct', label: 'Body at least', suffix: '% of candle', step: 5, help: 'Open-to-close vs high-to-low; filters spiky candles that went nowhere' },
]

function RulesEditor({ data, onSaved }) {
  const toast = useToast()
  const [draft, setDraft] = useState(data.rules)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(data.rules), [data.rules])

  const dirty = RULE_FIELDS.some((f) => Number(draft[f.key]) !== data.rules[f.key])
  const save = async (rules) => {
    setSaving(true)
    try {
      const res = await api.put('/api/in-play/rules', Object.fromEntries(RULE_FIELDS.map((f) => [f.key, Number(rules[f.key])])))
      onSaved(res)
      toast.success(`Rules saved: ${res.entries.length} coins match in the last ${data.retention_days} days`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Alert Rules">
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Daily candles compared with the previous {data.lookback_days} days. Changes apply to the last {data.retention_days} days straight away
        (without re-sending old alerts) and to every new move.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {RULE_FIELDS.map((f) => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', color: '#cbd5e1', minWidth: 0 }}>
            {f.label} ({f.suffix})
            <input
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

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [])

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
            Daily candle with volume &gt;{rules.volume_mult}x and size &gt;{rules.range_mult}x the {inPlay.lookback_days}-day average,
            body ≥ {rules.min_body_pct}% and opposing wick ≤ {rules.max_wick_pct}% of the candle. Kept {inPlay.retention_days} days, newest first.
            {inPlay.last_scan && <> Last scan {timeAgo(inPlay.last_scan)} across {inPlay.symbols_scanned} Binance USDT pairs.</>}
            {!inPlay.ai_summaries && <> AI catalyst summaries are off (no API key configured).</>}
          </p>
        )}
        {entries.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center' }}>No coins match your rules in the last 30 days. The scanner runs every 15 minutes; try loosening the rules below.</p>
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
                      <td style={{ ...cellStyle, color: '#f59e0b', fontFamily: 'monospace' }}>{e.volume_ratio.toFixed(1)}x</td>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>
                        {e.range_ratio.toFixed(1)}x
                        <div className="muted" style={{ fontSize: '0.75rem' }}>body {Math.round(e.body_pct)}%</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{e.candle_date}{e.candle_forming ? ' (live)' : ''}</div>
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
