import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../api/client'
import Card from './Card'
import LoadingSpinner from './LoadingSpinner'

const Plot = lazy(() => import('react-plotly.js'))

// Same inputs and defaults as the TradingView SurgeX script
const DEFAULTS = {
  heikin_ashi: false, price_type: 'close', plot_type: 'surge', ma_type: 'wma',
  period_d: 5, period_v: 5, period_a: 5, period_s: 5, alma_offset: 2, alma_sigma: 1,
  min_spread: 3, show_marks: false, spike_multiplier: 1,
}
const STORE_KEY = 'surgex-settings'
const PRICE_TYPES = [['close', 'Close'], ['oc2', '(Open+Close)/2'], ['hlc3', '(High+Low+Close)/3'], ['hl2', '(High+Low)/2'], ['ohlc4', '(O+H+L+C)/4']]
const SERIES = { distance: 'Distance', velocity: 'Velocity', acceleration: 'Acceleration', surge: 'Surge' }

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}') }
  } catch {
    return DEFAULTS  // storage blocked (private mode etc.)
  }
}

function saveSettings(s) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* not persisted */ }
}

// One sentence on where momentum stands, from velocity/acceleration/surge at the last bar
function readingText(r) {
  if (!r?.velocity) return null
  const dir = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'flat')
  const v = r.velocity, a = r.acceleration, s = r.surge
  let text = `Price is moving ${dir(v.value)}`
  if (a) text += a.value * v.value > 0 ? ', and speeding up' : a.value * v.value < 0 ? ', but slowing' : ''
  if (s && a) text += s.value * a.value > 0 ? ' (the change is still building).' : s.value * a.value < 0 ? ' (the change is easing off).' : '.'
  else text += '.'
  const crosses = Object.entries(r).filter(([, x]) => x.crossed_zero).map(([k, x]) => `${SERIES[k].toLowerCase()} just crossed zero ${x.crossed_zero}`)
  return crosses.length ? `${text} Note: ${crosses.join('; ')}.` : text
}

export default function SurgeXPanel({ instrumentId, timeframe, bars }) {
  const [st, setSt] = useState(loadSettings)
  const [draft, setDraft] = useState(st)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    const q = new URLSearchParams({ timeframe, bars: String(Math.min(bars, 800)) })
    for (const [k, v] of Object.entries(st)) if (k !== 'show_marks') q.set(k, String(v))
    api.get(`/api/instruments/${encodeURIComponent(instrumentId)}/surgex?${q}`).then(setData).catch((e) => setError(e.message))
  }, [instrumentId, timeframe, bars, st])

  const apply = (next) => {
    setSt(next)
    setDraft(next)
    saveSettings(next)
  }
  const num = (k) => (e) => setDraft({ ...draft, [k]: e.target.value })
  const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: '#cbd5e1', minWidth: 0 }

  const ys = data?.series?.[data.plotted] || []
  const x = (data?.t || []).map((t) => new Date(t))
  const marks = st.show_marks ? data?.marks || [] : []
  const reading = readingText(data?.reading)

  return (
    <Card title={`SurgeX · ${SERIES[st.plot_type]} (${timeframe})`} className="mt-1">
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
        Smoothed rate of change of price: distance (smoothed price), velocity (its change), acceleration (change in
        velocity) and surge (change in acceleration). {reading && <strong style={{ color: '#e2e8f0' }}>{reading}</strong>}
      </p>
      {error ? <p className="negative">{error}</p> : data === null ? <LoadingSpinner /> : (
        <Suspense fallback={<LoadingSpinner />}>
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', x, y: ys, name: SERIES[data.plotted], line: { color: '#7b61ff', width: 2 }, connectgaps: false },
              ...(marks.length ? [
                { type: 'scatter', mode: 'markers', name: 'Peaks', x: marks.filter((m) => m.kind === 'peak').map((m) => new Date(m.t)),
                  y: marks.filter((m) => m.kind === 'peak').map((m) => m.spike), marker: { symbol: 'triangle-down', size: 9, color: '#ff6b6b' } },
                { type: 'scatter', mode: 'markers', name: 'Troughs', x: marks.filter((m) => m.kind === 'trough').map((m) => new Date(m.t)),
                  y: marks.filter((m) => m.kind === 'trough').map((m) => m.spike), marker: { symbol: 'triangle-up', size: 9, color: '#00d4aa' } },
              ] : []),
            ]}
            layout={{
              paper_bgcolor: '#0a0e1a', plot_bgcolor: '#0a0e1a', font: { color: '#e2e8f0' }, margin: { l: 60, r: 20, t: 10, b: 40 },
              xaxis: { gridcolor: '#1f2937' }, yaxis: { gridcolor: '#1f2937', zeroline: true, zerolinecolor: '#64748b', zerolinewidth: 1 },
              showlegend: marks.length > 0, legend: { orientation: 'h', y: 1.1 }, hovermode: 'x unified',
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: 260 }}
          />
        </Suspense>
      )}

      <button type="button" className="btn btn-sm btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide settings' : 'Settings'}
      </button>
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); apply({ ...draft }) }} style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <label style={field} htmlFor="sx-plot">Plot
              <select id="sx-plot" className="input" value={draft.plot_type} onChange={num('plot_type')}>
                {Object.entries(SERIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={field} htmlFor="sx-price">Price
              <select id="sx-price" className="input" value={draft.price_type} onChange={num('price_type')}>
                {PRICE_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={field} htmlFor="sx-ma">Moving average
              <select id="sx-ma" className="input" value={draft.ma_type} onChange={num('ma_type')}>
                <option value="wma">WMA</option>
                <option value="alma">ALMA</option>
              </select>
            </label>
            {[['period_d', 'Distance period'], ['period_v', 'Velocity period'], ['period_a', 'Acceleration period'], ['period_s', 'Surge period']].map(([k, label]) => (
              <label key={k} style={field} htmlFor={`sx-${k}`}>{label}
                <input id={`sx-${k}`} className="input" type="number" min={3} max={200} step={1} value={draft[k]} onChange={num(k)} />
              </label>
            ))}
            {draft.ma_type === 'alma' && [['alma_offset', 'ALMA offset'], ['alma_sigma', 'ALMA sigma']].map(([k, label]) => (
              <label key={k} style={field} htmlFor={`sx-${k}`}>{label}
                <input id={`sx-${k}`} className="input" type="number" step={0.2} value={draft[k]} onChange={num(k)} />
              </label>
            ))}
            <label style={field} htmlFor="sx-spread">Min peak/trough spread (bars)
              <input id="sx-spread" className="input" type="number" min={1} step={1} value={draft.min_spread} onChange={num('min_spread')} />
            </label>
            <label style={field} htmlFor="sx-spike">Spike multiplier
              <input id="sx-spike" className="input" type="number" min={1} max={1000000} step={1} value={draft.spike_multiplier} onChange={num('spike_multiplier')} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0.75rem 0', fontSize: '0.85rem' }}>
            <label htmlFor="sx-ha" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input id="sx-ha" type="checkbox" checked={draft.heikin_ashi} onChange={(e) => setDraft({ ...draft, heikin_ashi: e.target.checked })} />
              Use Heikin Ashi candles
            </label>
            <label htmlFor="sx-marks" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input id="sx-marks" type="checkbox" checked={draft.show_marks} onChange={(e) => setDraft({ ...draft, show_marks: e.target.checked })} />
              Show peaks and troughs
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-sm">Apply</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => apply(DEFAULTS)}>Reset to defaults</button>
          </div>
        </form>
      )}
    </Card>
  )
}
