// Labels, badge styles and number formatting shared by every multi-asset page.

export const ASSET_CLASSES = [
  { value: 'crypto', label: 'Crypto', badge: 'badge-purple' },
  { value: 'stock', label: 'Stock', badge: 'badge-blue' },
  { value: 'etf', label: 'ETF', badge: 'badge-green' },
  { value: 'commodity', label: 'Commodity', badge: 'badge-yellow' },
  { value: 'bond', label: 'Bond', badge: 'badge-red' },
  { value: 'fx', label: 'Forex', badge: 'badge-purple' },
  { value: 'rate', label: 'Yield', badge: 'badge-red' },
  { value: 'index', label: 'Index', badge: 'badge-blue' },
]
const BY_VALUE = Object.fromEntries(ASSET_CLASSES.map((c) => [c.value, c]))

export const classLabel = (cls) => BY_VALUE[cls]?.label || cls
export const classBadge = (cls) => BY_VALUE[cls]?.badge || 'badge-blue'

export function ClassBadge({ cls }) {
  return <span className={`badge ${classBadge(cls)}`} style={{ whiteSpace: 'nowrap' }}>{classLabel(cls)}</span>
}

// Price with enough digits for its size: 76,528.01 / 2.2668 / 0.004712
export function price(n, decimals) {
  if (n == null || Number.isNaN(Number(n))) return '--'
  const v = Number(n)
  const d = decimals ?? (Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6)
  return v.toLocaleString(undefined, { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })
}

export function usd(n, { sign = false, compact = false } = {}) {
  if (n == null || Number.isNaN(Number(n))) return '--'
  const v = Number(n)
  const s = sign && v > 0 ? '+' : v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (compact) {
    for (const [div, unit] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
      if (a >= div) return `${s}$${(a / div).toFixed(1)}${unit}`
    }
  }
  return `${s}$${a.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Price with its currency: "$4,132.30" for USD; pairs and other currencies without a "$"
export function quotePrice(n, inst) {
  if (n == null) return '--'
  const ccy = inst?.currency || 'USD'
  const cls = inst?.asset_class
  if (cls === 'rate') return `${price(n, inst.price_decimals)}%`
  if (cls === 'index' || cls === 'fx') return price(n, inst?.price_decimals)
  return ccy === 'USD' ? `$${price(n, inst?.price_decimals)}` : `${price(n, inst?.price_decimals)} ${ccy}`
}

export const pct = (n) => (n == null ? '--' : `${n > 0 ? '+' : ''}${Number(n).toFixed(2)}%`)
export const tone = (n) => (n == null || n === 0 ? '' : n > 0 ? 'positive' : 'negative')
