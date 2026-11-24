// Chart ranges, candle sizes, indicator defaults and their saved settings (per browser)

const DAY = 86400
export const RANGES = [
  ['1D', DAY], ['5D', 5 * DAY], ['1M', 30 * DAY], ['3M', 91 * DAY], ['6M', 182 * DAY],
  ['1Y', 365 * DAY], ['2Y', 730 * DAY], ['5Y', 1826 * DAY],
]
export const CANDLES = [
  ['5m', 300], ['15m', 900], ['30m', 1800], ['1h', 3600], ['2h', 7200], ['3h', 10800], ['4h', 14400], ['6h', 21600],
  ['12h', 43200], ['1d', DAY], ['3d', 3 * DAY], ['1w', 7 * DAY], ['9d', 9 * DAY],
]
export const CANDLE_NAMES = {
  '5m': '5-minute', '15m': '15-minute', '30m': '30-minute', '1h': '1-hour', '2h': '2-hour', '3h': '3-hour',
  '4h': '4-hour', '6h': '6-hour', '12h': '12-hour', '1d': 'daily', '3d': '3-day', '1w': 'weekly', '9d': '9-day',
}
// Candle size picked when a range is chosen and the current size doesn't fit it
const DEFAULT_CANDLE = { '1D': '5m', '5D': '30m', '1M': '4h', '3M': '1d', '6M': '1d', '1Y': '1d', '2Y': '3d', '5Y': '1w' }
const MIN_BARS = 10
export const MAX_BARS = 900
const MINUTE_HISTORY_DAYS = 59  // Yahoo keeps 5/15/30-minute history for 60 days (stocks, futures, forex)

// Share of calendar time a market trades, so a range turns into the right number of bars
const ACTIVE = { '24/7': 1, us_equity: (6.5 / 24) * (5 / 7), index: (6.5 / 24) * (5 / 7), futures: (23 / 24) * (5 / 7), fx: 5 / 7 }

export function barsFor(range, candle, sessions = '24/7') {
  const r = RANGES.find(([k]) => k === range)?.[1]
  const c = CANDLES.find(([k]) => k === candle)?.[1]
  if (!r || !c) return 0
  const frac = c >= DAY ? (sessions === '24/7' ? 1 : 5 / 7) : (ACTIVE[sessions] ?? 1)
  return Math.ceil((r * frac) / c)
}

/** Why a candle size can't be used with a range ('' when it can). */
export function unusable(range, candle, sessions = '24/7') {
  const n = barsFor(range, candle, sessions)
  if (n > MAX_BARS) return 'Too many candles for this range: pick a shorter range or longer candles'
  if (n < MIN_BARS) return 'Too few candles for this range: pick a longer range or shorter candles'
  const r = RANGES.find(([k]) => k === range)[1]
  if (sessions !== '24/7' && ['5m', '15m', '30m'].includes(candle) && r > MINUTE_HISTORY_DAYS * DAY) {
    return 'Minute candles go back 60 days for this market'
  }
  return ''
}

export function fitCandle(range, candle, sessions) {
  if (!unusable(range, candle, sessions)) return candle
  const preferred = DEFAULT_CANDLE[range]
  if (!unusable(range, preferred, sessions)) return preferred
  return CANDLES.map(([k]) => k).find((k) => !unusable(range, k, sessions)) || '1d'
}

export const OSC_DEFAULTS = { rsi_period: 14, rsi_upper: 70, rsi_lower: 30, stoch_period: 14, k: 3, d: 3, stoch_upper: 80, stoch_lower: 20 }
export const VIEW_DEFAULTS = { range: '6M', candle: '1d', panes: { volume: true, rsi: true, stoch: true, surge: true } }

export const SURGE_DEFAULTS = {
  heikin_ashi: false, price_type: 'close', plot_type: 'surge', ma_type: 'wma',
  period_d: 5, period_v: 5, period_a: 5, period_s: 5, alma_offset: 2, alma_sigma: 1,
  min_spread: 3, show_marks: false, spike_multiplier: 1,
}
export const SURGE_SERIES = { distance: 'Distance', velocity: 'Velocity', acceleration: 'Acceleration', surge: 'Surge' }

// Storage can be blocked (Safari private mode etc.): fall back to defaults, never throw
export function load(key, defaults) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || '{}')
    return { ...defaults, ...saved, ...(defaults.panes ? { panes: { ...defaults.panes, ...(saved.panes || {}) } } : {}) }
  } catch {
    return defaults
  }
}

export function save(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* not persisted */ }
}

/** One sentence on where SurgeX momentum stands at the last bar. */
export function surgeReading(r) {
  if (!r?.velocity) return null
  const dir = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'flat')
  const v = r.velocity, a = r.acceleration, s = r.surge
  let text = `Price is moving ${dir(v.value)}`
  if (a) text += a.value * v.value > 0 ? ', and speeding up' : a.value * v.value < 0 ? ', but slowing' : ''
  if (s && a) text += s.value * a.value > 0 ? ' (the change is still building).' : s.value * a.value < 0 ? ' (the change is easing off).' : '.'
  else text += '.'
  const crosses = Object.entries(r).filter(([, x]) => x.crossed_zero).map(([k, x]) => `${SURGE_SERIES[k].toLowerCase()} just crossed zero ${x.crossed_zero}`)
  return crosses.length ? `${text} Note: ${crosses.join('; ')}.` : text
}

export function zone(value, upper, lower) {
  if (value == null) return ''
  return value >= upper ? 'overbought' : value <= lower ? 'oversold' : 'neutral'
}
