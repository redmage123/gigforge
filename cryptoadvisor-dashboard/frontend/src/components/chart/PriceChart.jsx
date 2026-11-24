import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import IndicatorSettings from './IndicatorSettings'
import {
  CANDLE_NAMES, CANDLES, OSC_DEFAULTS, RANGES, SURGE_DEFAULTS, SURGE_SERIES, VIEW_DEFAULTS,
  barsFor, fitCandle, load, save, surgeReading, unusable, zone,
} from './chartSettings'

const Plot = lazy(() => import('react-plotly.js'))

const UP = '#00d4aa', DOWN = '#ff6b6b', GRID = '#1f2937', MUTED = '#64748b'
const PANES = [
  { key: 'volume', label: 'Volume', weight: 0.7 },
  { key: 'rsi', label: 'RSI', weight: 1 },
  { key: 'stoch', label: 'Stoch RSI', weight: 1 },
  { key: 'surge', label: 'SurgeX', weight: 1.1 },
]
const fmt = (v, d = 2) => (v == null ? '--' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }))

/**
 * Candlestick chart with volume, RSI, Stochastic RSI and SurgeX panes on one shared time axis:
 * zooming or panning any pane moves them all. Range and candle size are chosen separately.
 */
export default function PriceChart({ instrumentId, instrument, storageKey = 'price-chart', compact = false }) {
  const [fetched, setFetched] = useState(null)        // instrument details, when the caller didn't pass them
  const [view, setView] = useState(() => load(storageKey, VIEW_DEFAULTS))
  const [osc, setOsc] = useState(() => load('osc-settings', OSC_DEFAULTS))
  const [surge, setSurge] = useState(() => load('surgex-settings', SURGE_DEFAULTS))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [result, setResult] = useState({ key: null })  // last response, tagged with the request it answers

  useEffect(() => {
    if (instrument) return
    api.get(`/api/instruments/${encodeURIComponent(instrumentId)}`)
      .then((r) => setFetched({ id: instrumentId, inst: r }))
      .catch((e) => setFetched({ id: instrumentId, error: e.message }))
  }, [instrumentId, instrument])
  const inst = instrument || (fetched?.id === instrumentId ? fetched.inst : null)

  const sessions = inst?.sessions || '24/7'
  const candle = fitCandle(view.range, view.candle, sessions)
  const bars = barsFor(view.range, candle, sessions)

  const update = (next) => { setView(next); save(storageKey, next) }
  const pickRange = (range) => update({ ...view, range, candle: fitCandle(range, view.candle, sessions) })
  const pickCandle = (c) => update({ ...view, candle: c })
  const togglePane = (key) => update({ ...view, panes: { ...view.panes, [key]: !view.panes[key] } })

  const query = new URLSearchParams({ timeframe: candle, bars: String(bars) })
  for (const k of ['rsi_period', 'stoch_period', 'k', 'd']) query.set(k, String(osc[k]))
  for (const [k, v] of Object.entries(surge)) if (k !== 'show_marks') query.set(k, String(v))
  const url = inst ? `/api/instruments/${encodeURIComponent(instrumentId)}/chart?${query}` : null

  useEffect(() => {
    if (!url) return
    let live = true
    api.get(url).then((r) => live && setResult({ key: url, data: r })).catch((e) => live && setResult({ key: url, error: e.message }))
    return () => { live = false }
  }, [url])
  // A response for an earlier choice of range or candle is never shown under the new one
  const data = result.key === url ? result.data || null : null
  const error = (fetched?.id === instrumentId && fetched.error) || (result.key === url ? result.error || '' : '')

  const hasVolume = inst?.has_volume !== false
  const paneKeys = PANES.filter((p) => view.panes[p.key] && (p.key !== 'volume' || hasVolume)).map((p) => p.key).join()
  const figure = useMemo(() => {
    if (!data) return null
    const shown = PANES.filter((p) => paneKeys.split(',').includes(p.key))
    return buildFigure(data, shown, osc, surge, inst)
  }, [data, paneKeys, osc, surge, inst])

  const last = data?.candles?.[data.candles.length - 1]
  const lastOf = (xs) => xs?.filter((v) => v != null).slice(-1)[0]
  const rsiNow = lastOf(data?.rsi), kNow = lastOf(data?.stoch_k), dNow = lastOf(data?.stoch_d)
  const reading = surgeReading(data?.surgex?.reading)
  const name = inst?.symbol || instrumentId
  const summary = data && last
    ? `${name} ${CANDLE_NAMES[candle]} candles over ${view.range}. Last close ${fmt(last.c, inst?.price_decimals ?? 2)}. `
      + `RSI ${fmt(rsiNow, 1)} (${zone(rsiNow, osc.rsi_upper, osc.rsi_lower)}). `
      + `Stochastic RSI %K ${fmt(kNow, 1)}, %D ${fmt(dNow, 1)} (${zone(kNow, osc.stoch_upper, osc.stoch_lower)}). `
      + (reading ? `SurgeX: ${reading}` : '')
    : ''

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <div role="group" aria-label="Chart range" className="seg">
          {RANGES.map(([k]) => (
            <button key={k} type="button" className={`btn btn-sm ${k === view.range ? '' : 'btn-ghost'}`} aria-pressed={k === view.range}
              onClick={() => pickRange(k)}>{k}</button>
          ))}
        </div>
        <label htmlFor={`${storageKey}-candle`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          Candle
          <select id={`${storageKey}-candle`} className="input" style={{ width: 'auto', padding: '0.25rem 0.5rem' }} value={candle}
            onChange={(e) => pickCandle(e.target.value)}>
            {CANDLES.map(([k]) => {
              const why = unusable(view.range, k, sessions)
              return <option key={k} value={k} disabled={!!why} title={why}>{CANDLE_NAMES[k]}{why ? ' (not for this range)' : ''}</option>
            })}
          </select>
        </label>
        {!compact && (
          <div role="group" aria-label="Indicator panes" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            {PANES.filter((p) => p.key !== 'volume' || hasVolume).map((p) => (
              <label key={p.key} htmlFor={`${storageKey}-pane-${p.key}`} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input id={`${storageKey}-pane-${p.key}`} type="checkbox" checked={!!view.panes[p.key]} onChange={() => togglePane(p.key)} />
                {p.label}
              </label>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
          {settingsOpen ? 'Hide indicator settings' : 'Indicator settings'}
        </button>
      </div>

      {settingsOpen && (
        <IndicatorSettings idPrefix={storageKey} osc={osc} surge={surge} onApply={(o, s) => {
          setOsc(o); save('osc-settings', o); setSurge(s); save('surgex-settings', s)
        }} />
      )}

      {error ? <p className="negative" role="alert">{error}</p> : !figure ? <LoadingSpinner /> : data.candles.length === 0 ? (
        <p className="muted">No price history available.</p>
      ) : (
        <figure style={{ margin: 0 }} aria-label={`Price chart for ${name}`}>
          <Suspense fallback={<LoadingSpinner />}>
            <Plot data={figure.traces} layout={figure.layout} config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: figure.height }} useResizeHandler />
          </Suspense>
          <figcaption className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {CANDLE_NAMES[candle]} candles, {data.candles.length} bars.
            {view.panes.rsi && rsiNow != null && <> RSI <strong style={{ color: 'var(--text-primary, #e2e8f0)' }}>{fmt(rsiNow, 1)}</strong> ({zone(rsiNow, osc.rsi_upper, osc.rsi_lower)}).</>}
            {view.panes.stoch && kNow != null && <> Stoch RSI %K {fmt(kNow, 1)} / %D {fmt(dNow, 1)}.</>}
            {view.panes.surge && reading && <> SurgeX ({SURGE_SERIES[surge.plot_type]}): {reading}</>}
            <span className="sr-only"> {summary}</span>
          </figcaption>
        </figure>
      )}
    </div>
  )
}

function buildFigure(data, shown, osc, surge, inst) {
  const x = data.t.map((t) => new Date(t))
  const c = data.candles
  const gap = 0.03
  const total = 3 + shown.reduce((s, p) => s + p.weight, 0)   // price pane weighs 3
  const usable = 1 - gap * shown.length
  // Domains from the bottom up: last pane at the bottom, price at the top
  let y0 = 0
  const domains = {}
  for (const p of [...shown].reverse()) {
    const h = (p.weight / total) * usable
    domains[p.key] = [y0, y0 + h]
    y0 += h + gap
  }
  domains.price = [y0, 1]

  const axisName = {}
  ;['price', ...shown.map((p) => p.key)].forEach((k, i) => { axisName[k] = i === 0 ? 'y' : `y${i + 1}` })
  const layoutKey = (k) => (axisName[k] === 'y' ? 'yaxis' : `yaxis${axisName[k].slice(1)}`)
  const bottom = shown.length ? axisName[shown[shown.length - 1].key] : 'y'

  const traces = [{
    type: 'candlestick', x, open: c.map((b) => b.o), high: c.map((b) => b.h), low: c.map((b) => b.l), close: c.map((b) => b.c),
    increasing: { line: { color: UP } }, decreasing: { line: { color: DOWN } }, name: inst?.symbol || 'Price', yaxis: 'y',
  }]
  const layout = {
    paper_bgcolor: '#0a0e1a', plot_bgcolor: '#0a0e1a', font: { color: '#e2e8f0', size: 11 },
    margin: { l: 60, r: 20, t: 10, b: 40 }, showlegend: false, hovermode: 'x unified', dragmode: 'zoom',
    xaxis: { anchor: bottom, gridcolor: GRID, linecolor: GRID, rangeslider: { visible: false },
      showspikes: true, spikemode: 'across', spikesnap: 'cursor', spikecolor: MUTED, spikethickness: 1 },
    yaxis: { domain: domains.price, gridcolor: GRID, linecolor: GRID },
    shapes: [], annotations: [],
  }
  const label = (key, text) => layout.annotations.push({
    xref: 'paper', yref: 'paper', x: 0, y: domains[key][1], xanchor: 'left', yanchor: 'bottom', showarrow: false,
    text, font: { size: 10, color: MUTED },
  })
  const level = (axis, y, color) => layout.shapes.push({
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: axis, y0: y, y1: y, line: { color, width: 1, dash: 'dot' },
  })

  for (const p of shown) {
    const ya = axisName[p.key]
    const ax = { domain: domains[p.key], gridcolor: GRID, linecolor: GRID, zeroline: false }
    if (p.key === 'volume') {
      traces.push({ type: 'bar', x, y: c.map((b) => b.v), yaxis: ya, name: 'Volume',
        marker: { color: c.map((b) => (b.c >= b.o ? `${UP}66` : `${DOWN}66`)) } })
      label('volume', 'Volume ($)')
    } else if (p.key === 'rsi') {
      traces.push({ type: 'scatter', mode: 'lines', x, y: data.rsi, yaxis: ya, name: `RSI ${osc.rsi_period}`, line: { color: '#a78bfa', width: 1.5 } })
      Object.assign(ax, { range: [0, 100], tickvals: [osc.rsi_lower, 50, osc.rsi_upper] })
      level(ya, osc.rsi_upper, DOWN); level(ya, osc.rsi_lower, UP)
      label('rsi', `RSI (${osc.rsi_period})`)
    } else if (p.key === 'stoch') {
      traces.push({ type: 'scatter', mode: 'lines', x, y: data.stoch_k, yaxis: ya, name: '%K', line: { color: '#38bdf8', width: 1.5 } })
      traces.push({ type: 'scatter', mode: 'lines', x, y: data.stoch_d, yaxis: ya, name: '%D', line: { color: '#f59e0b', width: 1.2 } })
      Object.assign(ax, { range: [0, 100], tickvals: [osc.stoch_lower, 50, osc.stoch_upper] })
      level(ya, osc.stoch_upper, DOWN); level(ya, osc.stoch_lower, UP)
      label('stoch', `Stoch RSI (${osc.rsi_period}, ${osc.stoch_period}, ${osc.k}, ${osc.d})  %K blue · %D orange`)
    } else if (p.key === 'surge') {
      const sx = data.surgex
      traces.push({ type: 'scatter', mode: 'lines', x, y: sx.series[sx.plotted], yaxis: ya, name: SURGE_SERIES[sx.plotted],
        line: { color: '#7b61ff', width: 1.8 } })
      if (surge.show_marks) {
        for (const [kind, symbol, color] of [['peak', 'triangle-down', DOWN], ['trough', 'triangle-up', UP]]) {
          const m = sx.marks.filter((mk) => mk.kind === kind)
          traces.push({ type: 'scatter', mode: 'markers', x: m.map((mk) => new Date(mk.t)), y: m.map((mk) => mk.spike), yaxis: ya,
            name: kind === 'peak' ? 'Peaks' : 'Troughs', marker: { symbol, size: 8, color } })
        }
      }
      Object.assign(ax, { zeroline: true, zerolinecolor: MUTED })
      label('surge', `SurgeX · ${SURGE_SERIES[sx.plotted]}`)
    }
    layout[layoutKey(p.key)] = ax
  }
  // Every pane shares the one x axis, so zoom and pan always line up
  for (const t of traces) t.xaxis = 'x'
  const height = 360 + shown.reduce((s, p) => s + p.weight * 120, 0)
  return { traces, layout, height }
}
