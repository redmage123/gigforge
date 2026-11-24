import { useState } from 'react'
import { OSC_DEFAULTS, SURGE_DEFAULTS, SURGE_SERIES } from './chartSettings'

const PRICE_TYPES = [['close', 'Close'], ['oc2', '(Open+Close)/2'], ['hlc3', '(High+Low+Close)/3'], ['hl2', '(High+Low)/2'], ['ohlc4', '(O+H+L+C)/4']]
const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--text-secondary, #cbd5e1)', minWidth: 0 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }

function NumberField({ id, label, value, onChange, min, max, step = 1 }) {
  return (
    <label style={field} htmlFor={id}>{label}
      <input id={id} className="input" type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

const toNumbers = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' && v !== '' && !isNaN(v) ? Number(v) : v]))

/** RSI, Stochastic RSI and SurgeX settings; `onApply(osc, surge)` receives the new values. */
export default function IndicatorSettings({ osc, surge, onApply, idPrefix = 'pc' }) {
  const [o, setO] = useState(osc)
  const [s, setS] = useState(surge)
  const setOsc = (k) => (v) => setO({ ...o, [k]: v })
  const setSurge = (k) => (v) => setS({ ...s, [k]: v })
  const id = (k) => `${idPrefix}-${k}`

  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(toNumbers(o), toNumbers(s)) }} style={{ marginTop: '0.75rem' }}>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>RSI and Stochastic RSI</legend>
        <div style={grid}>
          <NumberField id={id('rsi')} label="RSI length" value={o.rsi_period} min={2} max={100} onChange={setOsc('rsi_period')} />
          <NumberField id={id('rsi-up')} label="RSI overbought" value={o.rsi_upper} min={50} max={100} onChange={setOsc('rsi_upper')} />
          <NumberField id={id('rsi-lo')} label="RSI oversold" value={o.rsi_lower} min={0} max={50} onChange={setOsc('rsi_lower')} />
          <NumberField id={id('st')} label="Stochastic length" value={o.stoch_period} min={2} max={100} onChange={setOsc('stoch_period')} />
          <NumberField id={id('k')} label="%K smoothing" value={o.k} min={1} max={20} onChange={setOsc('k')} />
          <NumberField id={id('d')} label="%D smoothing" value={o.d} min={1} max={20} onChange={setOsc('d')} />
          <NumberField id={id('st-up')} label="Stoch RSI upper" value={o.stoch_upper} min={50} max={100} onChange={setOsc('stoch_upper')} />
          <NumberField id={id('st-lo')} label="Stoch RSI lower" value={o.stoch_lower} min={0} max={50} onChange={setOsc('stoch_lower')} />
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>SurgeX</legend>
        <div style={grid}>
          <label style={field} htmlFor={id('sx-plot')}>Plot
            <select id={id('sx-plot')} className="input" value={s.plot_type} onChange={(e) => setSurge('plot_type')(e.target.value)}>
              {Object.entries(SURGE_SERIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={field} htmlFor={id('sx-price')}>Price
            <select id={id('sx-price')} className="input" value={s.price_type} onChange={(e) => setSurge('price_type')(e.target.value)}>
              {PRICE_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label style={field} htmlFor={id('sx-ma')}>Moving average
            <select id={id('sx-ma')} className="input" value={s.ma_type} onChange={(e) => setSurge('ma_type')(e.target.value)}>
              <option value="wma">WMA</option>
              <option value="alma">ALMA</option>
            </select>
          </label>
          {[['period_d', 'Distance period'], ['period_v', 'Velocity period'], ['period_a', 'Acceleration period'], ['period_s', 'Surge period']].map(([k, label]) => (
            <NumberField key={k} id={id(k)} label={label} value={s[k]} min={3} max={200} onChange={setSurge(k)} />
          ))}
          {s.ma_type === 'alma' && [['alma_offset', 'ALMA offset'], ['alma_sigma', 'ALMA sigma']].map(([k, label]) => (
            <NumberField key={k} id={id(k)} label={label} value={s[k]} step={0.2} onChange={setSurge(k)} />
          ))}
          <NumberField id={id('sx-spread')} label="Min peak/trough spread (bars)" value={s.min_spread} min={1} onChange={setSurge('min_spread')} />
          <NumberField id={id('sx-spike')} label="Spike multiplier" value={s.spike_multiplier} min={1} max={1000000} onChange={setSurge('spike_multiplier')} />
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <label htmlFor={id('sx-ha')} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input id={id('sx-ha')} type="checkbox" checked={s.heikin_ashi} onChange={(e) => setSurge('heikin_ashi')(e.target.checked)} />
            Use Heikin Ashi candles
          </label>
          <label htmlFor={id('sx-marks')} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input id={id('sx-marks')} type="checkbox" checked={s.show_marks} onChange={(e) => setSurge('show_marks')(e.target.checked)} />
            Show SurgeX peaks and troughs
          </label>
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="submit" className="btn btn-sm">Apply</button>
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => { setO(OSC_DEFAULTS); setS(SURGE_DEFAULTS); onApply(OSC_DEFAULTS, SURGE_DEFAULTS) }}>
          Reset to defaults
        </button>
      </div>
    </form>
  )
}
