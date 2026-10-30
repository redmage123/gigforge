import { useEffect, useMemo, useRef, useState } from 'react'

const AXIS_W = 58
const TIME_H = 18
const PAD_TOP = 22
const VOL_FRAC = 0.18

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function niceStep(range, target) {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

const fmtTime = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * Candlestick + volume chart in plain SVG.
 * candles: [{t,o,h,l,c,v}]; lines: [{price, color, label, dash}] overlays (avg entry, working orders).
 */
export default function CandleChart({ candles, last, lines = [], label = 'Price chart', loading = false }) {
  const wrapRef = useRef(null)
  const { w, h } = useSize(wrapRef)
  const [hover, setHover] = useState(null)

  const plotW = Math.max(0, w - AXIS_W)
  const plotH = Math.max(0, h - TIME_H)
  const priceH = plotH * (1 - VOL_FRAC) - PAD_TOP

  const view = useMemo(() => {
    if (!candles?.length || plotW <= 0) return null
    const slot = 8
    const n = Math.min(candles.length, Math.max(20, Math.floor(plotW / slot)))
    const data = candles.slice(-n)
    let lo = Math.min(...data.map(c => c.l)), hi = Math.max(...data.map(c => c.h))
    for (const ln of lines) {
      if (ln.price >= lo * 0.97 && ln.price <= hi * 1.03) { lo = Math.min(lo, ln.price); hi = Math.max(hi, ln.price) }
    }
    const pad = (hi - lo) * 0.08 || 0.02
    lo -= pad; hi += pad
    const vmax = Math.max(...data.map(c => c.v), 1)
    const bw = plotW / n
    return { data, lo, hi, vmax, bw }
  }, [candles, lines, plotW])

  if (!view) {
    return (
      <div className="tt-chart-wrap" ref={wrapRef}>
        <div className="tt-chart-empty" role="status">{loading ? 'Loading chart…' : 'No trades yet'}</div>
      </div>
    )
  }

  const { data, lo, hi, vmax, bw } = view
  const y = (p) => PAD_TOP + (hi - p) / (hi - lo) * priceH
  const volTop = PAD_TOP + priceH + 4
  const volH = plotH - volTop
  const step = niceStep(hi - lo, 6)
  const ticks = []
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) ticks.push(p)
  const timeEvery = Math.max(1, Math.ceil(80 / bw))
  // Keep time labels clear of the plot edges so they are never clipped.
  const showTime = (i) => i % timeEvery === 0 && i * bw + bw / 2 > 24 && i * bw + bw / 2 < plotW - 24
  const first = data[0], lastBar = data[data.length - 1]
  const summary = `${label}. ${data.length} bars from ${fmtTime(first.t)} to ${fmtTime(lastBar.t)}. `
    + `Open ${first.o.toFixed(2)}, high ${Math.max(...data.map(c => c.h)).toFixed(2)}, `
    + `low ${Math.min(...data.map(c => c.l)).toFixed(2)}, last ${lastBar.c.toFixed(2)}, `
    + `${lastBar.c >= first.o ? 'up' : 'down'} ${Math.abs(lastBar.c - first.o).toFixed(2)} over the period.`
  const shown = hover != null ? data[hover] : data[data.length - 1]

  const onMove = (e) => {
    const r = wrapRef.current.getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left) / bw)
    setHover(i >= 0 && i < data.length ? i : null)
  }

  return (
    <div className="tt-chart-wrap" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {shown && (
        <div className="tt-chart-legend" aria-hidden="true">
          {fmtTime(shown.t)}&nbsp; O <b>{shown.o.toFixed(2)}</b> H <b>{shown.h.toFixed(2)}</b> L <b>{shown.l.toFixed(2)}</b> C{' '}
          <b className={shown.c >= shown.o ? 'tt-up' : 'tt-down'}>{shown.c.toFixed(2)}</b> V <b>{shown.v.toLocaleString()}</b>
        </div>
      )}
      <svg width={w} height={h} role="img" aria-label={summary}>
        {ticks.map(p => (
          <g key={p}>
            <line x1={0} x2={plotW} y1={y(p)} y2={y(p)} stroke="#121b27" />
            <text x={plotW + 6} y={y(p) + 3} fill="#4a5668" fontSize="10" fontFamily="var(--tt-mono)">{p.toFixed(2)}</text>
          </g>
        ))}
        {data.map((c, i) => showTime(i) && (
          <g key={'t' + c.t}>
            <line x1={i * bw + bw / 2} x2={i * bw + bw / 2} y1={PAD_TOP} y2={plotH} stroke="#0e151f" />
            <text x={i * bw + bw / 2} y={h - 5} fill="#4a5668" fontSize="10" textAnchor="middle" fontFamily="var(--tt-mono)">{fmtTime(c.t)}</text>
          </g>
        ))}
        {data.map((c, i) => {
          const up = c.c >= c.o
          const col = up ? '#19c37d' : '#f0475a'
          const x = i * bw + bw / 2
          const bodyW = Math.max(1, bw * 0.62)
          const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c))
          return (
            <g key={c.t}>
              <rect x={x - bodyW / 2} width={bodyW} y={volTop + volH * (1 - c.v / vmax)} height={volH * c.v / vmax}
                fill={col} opacity={0.28} />
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} />
              <rect x={x - bodyW / 2} width={bodyW} y={top} height={Math.max(1, bot - top)} fill={up ? '#05080d' : col} stroke={col} />
            </g>
          )
        })}
        {lines.filter(l => l.price > lo && l.price < hi).map((l, i) => (
          <g key={'ln' + i}>
            <line x1={0} x2={plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeDasharray={l.dash || '4 3'} opacity={0.85} />
            <rect x={plotW} y={y(l.price) - 7} width={AXIS_W} height={14} fill={l.color} />
            <text x={plotW + 4} y={y(l.price) + 3.5} fill="#05080d" fontSize="10" fontWeight="700" fontFamily="var(--tt-mono)">
              {l.label || l.price.toFixed(2)}
            </text>
          </g>
        ))}
        {last != null && last > lo && last < hi && (
          <g>
            <line x1={0} x2={plotW} y1={y(last)} y2={y(last)} stroke="#f5a524" strokeDasharray="2 2" opacity={0.7} />
            <rect x={plotW} y={y(last) - 8} width={AXIS_W} height={16} fill="#f5a524" />
            <text x={plotW + 6} y={y(last) + 4} fill="#05080d" fontSize="11" fontWeight="700" fontFamily="var(--tt-mono)">{last.toFixed(2)}</text>
          </g>
        )}
        {hover != null && (
          <line x1={hover * bw + bw / 2} x2={hover * bw + bw / 2} y1={PAD_TOP} y2={plotH} stroke="#7d8a9c" strokeDasharray="3 3" opacity={0.6} />
        )}
        <line x1={plotW} x2={plotW} y1={0} y2={plotH} stroke="#1c2735" />
      </svg>
    </div>
  )
}
