/**
 * Forecast Verification ("Forecast Skill") page.
 *
 * What: scores BACSWN's forecasts against what was observed: headline accuracy and
 * per-variable error cards, skill by lead time, a forecast-vs-observed chart, IFR/LIFR
 * warning skill (POD/FAR/CSI/HSS with the contingency table), bias-correction (MOS)
 * gains, an operations briefing and a per-station leaderboard with a detail dialog.
 * Why: forecast users (and funders) need evidence of how good the forecasts are, in
 * plain language. Every card, column header and section has an explanation popup.
 * How: polls `api.verificationScoreboard`, `verificationStations` and
 * `verificationWarnings` for the chosen window, plus `verificationCorrection` and
 * `briefing`. The window and chart selection live in the URL (useUrlState) so a copied
 * chart link reopens the same view. Charts are hand-drawn SVG with table alternatives.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import Dialog from '../components/a11y/Dialog'
import ChartActions from '../components/share/ChartActions'
import { useUrlState, oneOf } from '../components/share/useUrlState'

// ── Data-mode badge ──────────────────────────────────────────────────────
/** Badge text, colour and explanation for each scoreboard `data_mode`. */
const MODE_BADGE = {
  live: { text: 'LIVE DATA', color: '#047857', detail: 'Forecasts verified against station observations' },
  backfill: { text: 'REANALYSIS BACKFILL', color: '#1d4ed8', detail: 'Open-Meteo ERA5 reanalysis (real)' },
  mixed: { text: 'MIXED (incl. seed)', color: '#b45309', detail: 'Contains illustrative seed data' },
  seed: { text: 'SEED DATA — ILLUSTRATIVE', color: '#b45309', detail: 'Reanalysis unavailable; placeholder numbers' },
  empty: { text: 'ACCUMULATING', color: '#475569', detail: 'Capturing forecasts — verification builds over time' },
}

/**
 * Value with a unit suffix, or an em dash when missing.
 * @param {number|string|null|undefined} v
 * @param {string} [suffix]
 * @returns {string}
 */
const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : v + suffix)
/** Error magnitude (MAE) prefixed with ± so it never reads as an absolute reading; em dash when missing. */
const fmtErr = (v, unit = '') => (v === null || v === undefined ? '—' : `±${v}${unit}`)
/**
 * Text colour for an accuracy percentage (>=85 green, >=70 blue, >=50 amber, else red).
 * Theme tokens with >=4.5:1 contrast in both themes; the number itself carries the meaning.
 * @param {number|null|undefined} p
 * @returns {string} CSS colour
 */
const accColor = (p) => (p === null || p === undefined ? 'var(--text-muted)' : p >= 85 ? 'var(--success-text)' : p >= 70 ? 'var(--accent-text)' : p >= 50 ? 'var(--warning-text)' : 'var(--danger-text)')
/** Text colour for a lower-is-better score: green at or below `good`, amber at or below `ok`, else red. */
const lowerBetter = (v, good, ok) => (v == null ? 'var(--text-muted)' : v <= good ? 'var(--success-text)' : v <= ok ? 'var(--warning-text)' : 'var(--danger-text)')
/** Text colour for a higher-is-better score: green at or above `good`, amber at or above `ok`, else red. */
const higherBetter = (v, good, ok) => (v == null ? 'var(--text-muted)' : v >= good ? 'var(--success-text)' : v >= ok ? 'var(--warning-text)' : 'var(--danger-text)')

// ── Plain-language explanations ────────────────────────────────────────────
/** Plain-language explanation per headline/variable stat card. */
const CARD_INFO = {
  overall: 'A single 0–100% score blending how close our temperature, wind and pressure forecasts were with how often we correctly called the flight conditions. 100% = perfect. Higher is better.',
  category: 'How often our forecast correctly called the flying conditions — VFR (clear), MVFR (marginal), IFR (instrument) or LIFR (low-instrument) — versus what was actually observed at the station.',
  temp_c: 'Mean Absolute Error: on average, how many °C the temperature forecast was off from the actual reading. Lower is better. Bias shows whether we run warm (+) or cold (−); RMSE penalises the occasional large miss.',
  wind_speed_kt: 'On average, how many knots the wind-speed forecast missed by. Lower is better. Bias shows whether we typically over- or under-forecast wind; RMSE flags volatility.',
  pressure_hpa: 'On average, how many hectopascals (hPa) the air-pressure forecast was off. Pressure is highly predictable, so errors are small. Lower is better.',
}
/** Plain-language explanation per page section. */
const SECTION_INFO = {
  lead: 'This shows how forecast accuracy changes with how far ahead we are predicting. Each bar is the average temperature error (°C) for forecasts made that many hours before the valid time. Forecasts are sharpest in the short range and get less accurate further out — bars rising left-to-right is the normal, expected pattern. The table adds wind error and the percentage of correct flight-condition calls at each lead time, plus how many forecasts back each figure.',
  fvo: 'A direct comparison of what we forecast (dashed blue) against what was actually observed (solid green) at a chosen station, for one weather variable and one lead time. Use the dropdowns to switch station, variable, and how far ahead the forecast was looking. The closer the two lines track each other, the better the forecast.',
  leaderboard: 'Every station ranked by overall forecast accuracy. Click any row to open a full breakdown for that station — per-variable error, accuracy by lead time, a forecast-vs-observed chart, and how well each flight-condition category was predicted.',
  warnings: 'How well we forecast dangerous instrument-flight conditions (IFR/LIFR) — the safety-critical view. POD (Probability of Detection): of all the times instrument conditions actually occurred, the percentage we correctly forecast — higher means we catch more dangerous weather. FAR (False-Alarm Ratio): of all our instrument-conditions forecasts, the percentage that did not happen — lower means fewer false alarms. CSI combines hits, misses and false alarms into one skill score. HSS (Heidke Skill Score) measures skill versus random chance (0 = no skill, 1 = perfect). The table is the standard 2x2 contingency of forecast vs observed.',
  correction: 'Bias correction (MOS) learns each station’s systematic forecast error from history and removes it — e.g. if wind is consistently forecast 2 kt too low at a station, we add 2 kt back. "Raw" is the unadjusted forecast; "Corrected" is after removing the learned bias. The improvement is measured OUT-OF-SAMPLE: the correction is trained on older data and tested on newer data it never saw, so the gain is real, not circular. Lower error and higher accuracy are better.',
}
/** Column explanations for lead-time tables (keys are the header labels, in column order). */
const LEAD_COL_INFO = {
  Lead: 'How far ahead the forecast was looking — e.g. +6h predicts 6 hours into the future. Accuracy normally falls as this grows.',
  'Temp MAE': 'Average temperature miss (°C) across all forecasts made at this lead time.',
  'Wind MAE': 'Average wind-speed miss (kt) across all forecasts made at this lead time.',
  'Cat Hit': 'Percentage of correct flight-condition calls at this lead time.',
  n: 'How many verified forecasts these figures are based on — bigger means a more reliable score.',
}
/** Column explanations for the station leaderboard (keys are the header labels, in column order). */
const LB_COL_INFO = {
  '#': 'Rank by overall accuracy — 1 is the most accurately forecast station.',
  Station: 'ICAO airport code for the station.',
  Name: 'Airport or location name.',
  Accuracy: 'Overall 0–100% accuracy for this station (blends temperature, wind and flight-condition skill).',
  'Temp MAE': "This station's average temperature miss (°C). Lower is better.",
  'Wind MAE': "This station's average wind-speed miss (kt). Lower is better.",
  'Cat Hit': 'How often flight conditions were called correctly at this station.',
  n: "Number of verified forecasts behind this station's scores.",
}

/** Display order of flight categories in the station breakdown. */
const CAT_ORDER = ['VFR', 'MVFR', 'IFR', 'LIFR']
/** Text/border colour per flight category (theme tokens, >=4.5:1). */
const CAT_TEXT_COLORS = { VFR: 'var(--cat-vfr-text)', MVFR: 'var(--cat-mvfr-text)', IFR: 'var(--cat-ifr-text)', LIFR: 'var(--cat-lifr-text)' }

/**
 * Forecast/observation pairs where both values are present.
 * @param {object[]|undefined} points timeseries points
 * @returns {object[]}
 */
const verifiedPairs = (points) => (points || []).filter(p => p.forecast_value !== null && p.observed_value !== null)

// ── Info popup and its trigger ──────────────────────────────────────────────
/**
 * Dialog showing an explanation.
 * @param {{info: {title: string, body: string}|null, onClose: function}} props
 */
function InfoModal({ info, onClose }) {
  return (
    <Dialog open={!!info} title={info?.title} onClose={onClose}>
      <p>{info?.body}</p>
    </Dialog>
  )
}

/**
 * Small "i" button that opens the explanation for `title` (click doesn't bubble).
 * @param {{title: string, onClick: function}} props
 */
function InfoDot({ title, onClick }) {
  return (
    <button type="button" className="info-dot" aria-label={`About ${title}`}
      onClick={e => { e.stopPropagation(); onClick() }}>i</button>
  )
}

/**
 * Stat card that opens its explanation when selected (a real button, so it works with
 * keyboard and screen readers).
 * @param {object} props
 * @param {string} props.label card title (also the explanation title)
 * @param {React.ReactNode} props.value headline figure
 * @param {string} [props.valueColor] colour for the figure
 * @param {React.ReactNode} props.detail secondary line
 * @param {string} props.info explanation text
 * @param {function(string, string): void} props.openInfo opens the explanation dialog
 */
function StatCard({ label, value, valueColor, detail, info, openInfo }) {
  return (
    <button type="button" className="stat-card" onClick={() => openInfo(label, info)}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 8, right: 10, color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic', fontWeight: 700 }}>ⓘ</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
      <span className="stat-detail">{detail}</span>
      <span className="sr-only">. Explain this figure</span>
    </button>
  )
}

/**
 * Column header whose label is a button opening the column's explanation.
 * @param {{label: string, info: string, openInfo: function, style?: object}} props
 */
function Th({ label, info, openInfo, style }) {
  return (
    <th scope="col" style={style}>
      <button type="button" className="th-btn" onClick={() => openInfo(label, info)}
        aria-label={`${label === 'n' ? 'n (sample size)' : label === '#' ? '# (rank)' : label}, explain column`}>{label}</button>
    </th>
  )
}

// ── Lead-time skill curve ───────────────────────────────────────────────────
/**
 * SVG bar chart of average temperature error by lead time (errors normally rise with
 * lead time). `big` renders the larger expanded version with more axis labels.
 * @param {{byLead: object[], big?: boolean}} props
 */
function LeadCurve({ byLead, big }) {
  const rows = (byLead || []).filter(r => r.temp_mae !== null && r.temp_mae !== undefined)
  if (!rows.length) return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Lead-time breakdown accumulates as live forecasts verify.</div>
  const W = big ? 920 : 520, H = big ? 420 : 200
  const padL = big ? 52 : 40, padB = big ? 40 : 28, padT = 14
  const fs = big ? 13 : 9, lfs = big ? 14 : 9
  const maxMae = Math.max(...rows.map(r => r.temp_mae), 1) * 1.2
  const bw = (W - padL - 10) / rows.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
      aria-label={`Bar chart: average temperature error by lead time, from ±${rows[0].temp_mae} °C at +${rows[0].lead_h}h to ±${rows[rows.length - 1].temp_mae} °C at +${rows[rows.length - 1].lead_h}h. Values are in the table below.`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const y = padT + (H - padT - padB) * (1 - f)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - 6} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
            {(big || f === 0 || f === 0.5 || f === 1) && <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={fs} fill="var(--text-muted)">{(maxMae * f).toFixed(1)}</text>}
          </g>
        )
      })}
      {rows.map((r, i) => {
        const h = (H - padT - padB) * (r.temp_mae / maxMae)
        const x = padL + i * bw + bw * 0.18
        const y = H - padB - h
        return (
          <g key={r.lead_h}>
            <rect x={x} y={y} width={bw * 0.64} height={h} rx="3" fill="var(--accent)" opacity="0.9" />
            <text x={x + bw * 0.32} y={y - 4} textAnchor="middle" fontSize={lfs} fill="var(--text-primary)">{r.temp_mae}</text>
            <text x={x + bw * 0.32} y={H - padB + (big ? 18 : 14)} textAnchor="middle" fontSize={lfs} fill="var(--text-muted)">+{r.lead_h}h</text>
          </g>
        )
      })}
      <text x={padL} y={10} fontSize={fs} fill="var(--text-muted)">Avg temperature error °C (higher = less accurate)</text>
    </svg>
  )
}

/**
 * Per-lead-time table of temperature/wind error, category hit rate and sample size;
 * used beside the curve, in the expanded view and in the station dialog.
 * @param {{byLead: object[], openInfo: function, marginTop?: number}} props
 */
function LeadTable({ byLead, openInfo, marginTop = 10 }) {
  return (
    <table className="data-table" style={marginTop ? { marginTop } : undefined}>
      <thead><tr>
        {Object.entries(LEAD_COL_INFO).map(([label, info]) => <Th key={label} label={label} info={info} openInfo={openInfo} />)}
      </tr></thead>
      <tbody>
        {(byLead || []).map(r => (
          <tr key={r.lead_h}>
            <td>+{r.lead_h}h</td>
            <td>{fmtErr(r.temp_mae, '°C')}</td>
            <td>{fmtErr(r.wind_mae, 'kt')}</td>
            <td>{fmt(r.cat_hit_rate, '%')}</td>
            <td>{fmt(r.n)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Forecast vs Observed ───────────────────────────────────────────────────
/**
 * SVG line chart of forecast (dashed) against observed (solid) values over time, with a
 * legend and a "Show data as a table" alternative. `big` renders the expanded version
 * with point markers and time ticks.
 * @param {{points: object[], unit: string, big?: boolean}} props
 */
function ForecastVsObserved({ points, unit, big }) {
  const pts = verifiedPairs(points)
  if (pts.length < 2) return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Not enough verified pairs yet for this selection.</div>
  const W = big ? 940 : 560, H = big ? 400 : 200
  const padL = big ? 48 : 38, padB = big ? 34 : 22, padT = 14
  const fs = big ? 13 : 9, sw = big ? 2.5 : 2, dot = big ? 2.6 : 0
  const vals = pts.flatMap(p => [p.forecast_value, p.observed_value])
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = (max - min) || 1
  /** Chart coordinates of value `v` at point index `i`. */
  const xy = (v, i) => [
    padL + (W - padL - 8) * (i / (pts.length - 1)),
    padT + (H - padT - padB) * (1 - (v - min) / range),
  ]
  /** SVG path through every point's `key` value. */
  const line = (key) => pts.map((p, i) => { const [x, y] = xy(p[key], i); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}` }).join(' ')
  /** Short UTC label for a time, e.g. "11/25 06Z". */
  const tlabel = (s) => { try { const d = new Date(s); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}Z` } catch { return '' } }
  const xticks = big ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : []
  const mae = pts.reduce((a, p) => a + Math.abs(p.forecast_value - p.observed_value), 0) / pts.length
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
        aria-label={`Line chart of forecast versus observed, ${pts.length} verified pairs from ${tlabel(pts[0].valid_at)} to ${tlabel(pts[pts.length - 1].valid_at)}; values range ${min.toFixed(1)} to ${max.toFixed(1)} ${unit}; average difference ${mae.toFixed(1)} ${unit}. Expand "Show data as a table" for every value.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const y = padT + (H - padT - padB) * (1 - f)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - 6} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              {(big || f === 0 || f === 1) && <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={fs} fill="var(--text-muted)">{(min + range * f).toFixed(1)}</text>}
            </g>
          )
        })}
        <path d={line('observed_value')} fill="none" stroke="var(--success)" strokeWidth={sw} />
        <path d={line('forecast_value')} fill="none" stroke="var(--accent)" strokeWidth={sw} strokeDasharray="5 3" />
        {dot > 0 && pts.map((p, i) => {
          const [ox, oy] = xy(p.observed_value, i); const [fx, fy] = xy(p.forecast_value, i)
          return <g key={i}><circle cx={ox} cy={oy} r={dot} fill="var(--success)" /><circle cx={fx} cy={fy} r={dot} fill="var(--accent)" /></g>
        })}
        {xticks.map((i) => {
          const [x] = xy(pts[i].observed_value, i)
          return <text key={i} x={x} y={H - padB + fs + 4} textAnchor="middle" fontSize={fs} fill="var(--text-muted)">{tlabel(pts[i].valid_at)}</text>
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, fontSize: big ? 13 : 12, marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 18, height: 3, background: 'var(--success)', verticalAlign: 'middle', marginRight: 6 }} />Observed</span>
        <span><span style={{ display: 'inline-block', width: 18, height: 3, background: 'var(--accent)', verticalAlign: 'middle', marginRight: 6 }} />Forecast</span>
        <span style={{ color: 'var(--text-muted)' }}>{pts.length} verified pairs ({unit})</span>
      </div>
      <details className="chart-data">
        <summary>Show data as a table</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Forecast versus observed values">
          <table className="data-table">
            <thead><tr><th scope="col">Valid time (UTC)</th><th scope="col">Forecast ({unit})</th><th scope="col">Observed ({unit})</th><th scope="col">Difference</th></tr></thead>
            <tbody>{pts.map((p, i) => (
              <tr key={i}><th scope="row">{tlabel(p.valid_at)}</th><td>{p.forecast_value}</td><td>{p.observed_value}</td>
                <td>{(p.forecast_value - p.observed_value > 0 ? '+' : '') + (p.forecast_value - p.observed_value).toFixed(1)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

// ── Operations briefing (synthesized from live data) ───────────────────────
/**
 * Operations briefing card: headline, sections and recommended actions synthesised by
 * the backend, labelled AI-polished or rule-based.
 * @param {{data: object|null}} props `api.briefing()` payload (null while loading)
 */
function BriefingCard({ data }) {
  const d = data || {}
  const sections = d.sections || []
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #3b82f6' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 Operations Briefing
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '1px 7px', borderRadius: 4,
            color: d.llm_used ? 'var(--cat-lifr-text)' : 'var(--success-text)', border: '1px solid currentColor' }}>
            {d.llm_used ? 'AI-POLISHED' : 'RULE-BASED'}
          </span>
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.generated_at || ''}</span>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {!data && <div style={{ color: 'var(--text-muted)' }}>Generating briefing…</div>}
        {data && (
          <>
            {d.headline && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{d.headline}</div>}
            {sections.map(s => (
              <p key={s.title} style={{ margin: '6px 0', fontSize: 13, lineHeight: 1.5 }}>
                <strong>{s.title}.</strong> {s.body}
              </p>
            ))}
            {d.recommendations && d.recommendations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <h4 style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Recommended actions</h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {d.recommendations.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
                </ul>
              </div>
            )}
            {d.data_sources && (
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 10 }}>
                Synthesized from: {d.data_sources.join(' · ')}
                {!d.llm_available && ' · deterministic (no hallucination); LLM rephrasing available when a model endpoint is configured'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── IFR/LIFR warning verification (safety-critical) ────────────────────────
/**
 * Collapsible IFR/LIFR warning-skill card: POD/FAR/CSI/HSS stat cards, the 2x2
 * contingency table and per-lead skill. Collapsed by default, showing a one-line summary.
 * @param {{data: object|null, openInfo: function}} props
 */
function WarningSkillCard({ data, openInfo }) {
  const [open, setOpen] = useState(false)   // collapsed by default for demos
  const d = data || {}
  const o = d.overall || {}
  const cell = { padding: '8px 10px', textAlign: 'center', border: '1px solid var(--border)' }
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" className="th-btn" style={{ borderBottom: 'none', fontWeight: 600 }}
            aria-expanded={open} aria-controls="warn-skill-body" onClick={() => setOpen(v => !v)}>
            <span aria-hidden="true" style={{ marginRight: 6, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
            IFR/LIFR Warning Skill
          </button>
          <InfoDot title="IFR/LIFR Warning Skill" onClick={() => openInfo('IFR/LIFR Warning Skill', SECTION_INFO.warnings)} />
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {open ? `${fmt(o.events)} instrument-condition events`
                : `POD ${fmt(o.pod, '%')} · FAR ${fmt(o.far, '%')} · CSI ${fmt(o.csi, '%')}`}
        </span>
      </div>
      <div id="warn-skill-body" style={{ padding: '10px 14px', display: open ? 'block' : 'none' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          How well we forecast dangerous instrument conditions ({d.warning_definition || 'IFR or LIFR'}).
        </div>
        <div className="card-grid" style={{ marginBottom: 14 }}>
          <StatCard label="Detection (POD)" value={fmt(o.pod, '%')} valueColor={accColor(o.pod)}
            detail="of real IFR/LIFR events caught" info={SECTION_INFO.warnings} openInfo={openInfo} />
          <StatCard label="False Alarms (FAR)" value={fmt(o.far, '%')} valueColor={lowerBetter(o.far, 20, 40)}
            detail="of our warnings that didn't verify (lower better)" info={SECTION_INFO.warnings} openInfo={openInfo} />
          <StatCard label="Critical Success (CSI)" value={fmt(o.csi, '%')} valueColor={accColor(o.csi)}
            detail="overall warning skill" info={SECTION_INFO.warnings} openInfo={openInfo} />
          <StatCard label="Heidke Skill (HSS)" value={fmt(o.hss)} valueColor={higherBetter(o.hss, 0.5, 0.2)}
            detail="skill vs random chance (1 = perfect)" info={SECTION_INFO.warnings} openInfo={openInfo} />
        </div>
        {/* 2x2 contingency table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, margin: '0 auto' }}>
            <caption className="sr-only">Contingency table: forecast against observed instrument conditions</caption>
            <thead>
              <tr>
                <td style={{ ...cell, background: 'transparent', border: 'none' }}></td>
                <th scope="col" style={{ ...cell, background: 'var(--bg-primary)' }}>Observed IFR/LIFR</th>
                <th scope="col" style={{ ...cell, background: 'var(--bg-primary)' }}>Observed VFR/MVFR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" style={{ ...cell, background: 'var(--bg-primary)', fontWeight: 600 }}>Forecast IFR/LIFR</th>
                <td style={{ ...cell, color: 'var(--success-text)', fontWeight: 700 }}>{fmt(o.hits)}<div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>hits</div></td>
                <td style={{ ...cell, color: 'var(--warning-text)', fontWeight: 700 }}>{fmt(o.false_alarms)}<div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>false alarms</div></td>
              </tr>
              <tr>
                <th scope="row" style={{ ...cell, background: 'var(--bg-primary)', fontWeight: 600 }}>Forecast VFR/MVFR</th>
                <td style={{ ...cell, color: 'var(--danger-text)', fontWeight: 700 }}>{fmt(o.misses)}<div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>misses</div></td>
                <td style={{ ...cell, color: 'var(--text-secondary)', fontWeight: 700 }}>{fmt(o.correct_negatives)}<div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>correct</div></td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Per-lead */}
        {(d.by_lead || []).length > 0 && (
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead><tr>
              <Th label="Lead" info={LEAD_COL_INFO.Lead} openInfo={openInfo} />
              <Th label="Detection" info={SECTION_INFO.warnings} openInfo={openInfo} />
              <Th label="False Alarms" info={SECTION_INFO.warnings} openInfo={openInfo} />
              <Th label="CSI" info={SECTION_INFO.warnings} openInfo={openInfo} />
              <Th label="Events" info="Number of actual IFR/LIFR events at this lead time." openInfo={openInfo} />
            </tr></thead>
            <tbody>
              {d.by_lead.map(r => (
                <tr key={r.lead_h}>
                  <td>+{r.lead_h}h</td><td>{fmt(r.pod, '%')}</td><td>{fmt(r.far, '%')}</td>
                  <td>{fmt(r.csi, '%')}</td><td>{fmt(r.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Bias-correction (MOS) raw-vs-corrected comparison ──────────────────────
/**
 * Arrow and percentage for a change in error (down = better), with screen-reader words.
 * Changes within ±0.5% count as no change.
 * @param {{pct: number|null}} props
 */
function ImprovementBadge({ pct }) {
  if (pct === null || pct === undefined) return null
  const better = pct > 0.5
  const worse = pct < -0.5
  const color = better ? 'var(--success-text)' : worse ? 'var(--danger-text)' : 'var(--text-muted)'
  const arrow = better ? '▼' : worse ? '▲' : '→'
  const words = better ? 'error down' : worse ? 'error up' : 'no change'
  return <span style={{ color, fontWeight: 700, fontSize: 12 }}><span aria-hidden="true">{arrow}</span> <span className="sr-only">{words} </span>{Math.abs(pct)}%</span>
}

/**
 * Bias-correction (MOS) card: raw vs corrected error per variable as paired bars, the
 * model chosen per station, and how much of the live feed has been corrected.
 * @param {{data: object|null, openInfo: function}} props `api.verificationCorrection()` payload
 */
function CorrectionCard({ data, openInfo }) {
  const d = data || {}
  const vars = d.variables || {}
  const hasData = Object.keys(vars).length > 0
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #10b981' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ display: 'flex', alignItems: 'center' }}>Forecast Bias Correction (MOS)<InfoDot title="Forecast Bias Correction (MOS)" onClick={() => openInfo('Forecast Bias Correction (MOS)', SECTION_INFO.correction)} /></h3>
        {d.overall_raw_accuracy_pct != null && (
          <span style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>accuracy </span>
            <span style={{ color: accColor(d.overall_raw_accuracy_pct), fontWeight: 700 }}>{d.overall_raw_accuracy_pct}%</span>
            <span style={{ color: 'var(--text-muted)' }}> → </span>
            <span style={{ color: accColor(d.overall_corr_accuracy_pct), fontWeight: 700 }}>{d.overall_corr_accuracy_pct}%</span>
          </span>
        )}
      </div>
      <div style={{ padding: '10px 14px' }}>
        {!hasData && <div style={{ color: 'var(--text-muted)', padding: 12 }}>Not enough verified history yet to learn corrections.</div>}
        {hasData && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Removing each station’s learned systematic error. Raw → corrected mean error, measured out-of-sample.
            </div>
            {Object.entries(vars).map(([k, v]) => {
              const maxMae = Math.max(v.raw_mae, v.corr_mae, 0.01)
              return (
                <div key={k} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{v.label}</span>
                    <span style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{v.raw_mae} {v.unit}</span>
                      <span style={{ color: 'var(--text-muted)' }}> → </span>
                      <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>{v.corr_mae} {v.unit}</span>
                      <span style={{ marginLeft: 8 }}><ImprovementBadge pct={v.improvement_pct} /></span>
                    </span>
                  </div>
                  {/* raw (grey) vs corrected (green) bar, shared per-variable scale */}
                  <div style={{ position: 'relative', height: 18 }} aria-hidden="true">
                    <div style={{ position: 'absolute', top: 0, left: 0, height: 8, width: `${100 * v.raw_mae / maxMae}%`, background: '#475569', borderRadius: 3 }} />
                    <div style={{ position: 'absolute', top: 10, left: 0, height: 8, width: `${100 * v.corr_mae / maxMae}%`, background: '#10b981', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    bias {v.raw_bias} → {v.corr_bias} {v.unit} · n={v.n_eval}
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span><span style={{ display: 'inline-block', width: 14, height: 6, background: '#475569', verticalAlign: 'middle', marginRight: 5 }} />Raw forecast</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 6, background: '#10b981', verticalAlign: 'middle', marginRight: 5 }} />Bias-corrected</span>
            </div>
            {d.method_counts && Object.keys(d.method_counts).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                Model chosen per station: {Object.entries(d.method_counts).map(([m, c]) => `${m} ×${c}`).join(' · ')}
                {d.sklearn === false && ' (gradient boosting unavailable — linear/mean-bias only)'}
              </div>
            )}
            {d.live_applied && d.live_applied.applied_rows > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Live: correction applied to {d.live_applied.applied_rows} captured forecasts
                {d.live_applied.verified_rows >= 20 && d.live_applied.raw_mae != null
                  ? ` · verified ${d.live_applied.verified_rows}: ${d.live_applied.raw_mae} → ${d.live_applied.corr_mae} MAE`
                  : ` · ${d.live_applied.verified_rows} verified so far`}
              </div>
            )}
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }}>{d.method} {d.sample_size ? `(n=${d.sample_size} out-of-sample test points)` : ''}</p>
          </>
        )}
      </div>
    </div>
  )
}

/** Lead times offered before any verification data names its own. */
const DEFAULT_LEADS = [6, 24, 48, 72]

/**
 * Station / variable / lead-time pickers for a forecast-vs-observed chart.
 * @param {object} props
 * @param {{station?: string, variable: string, lead_h: number}} props.sel current selection
 * @param {function(function(object): object): void} props.setSel updater-style setter
 * @param {Object<string, {label: string}>} props.vars verified variables by key
 * @param {number[]} props.leads lead times (hours)
 * @param {object[]} [props.stations] stations to offer; omit to hide the station picker
 * @param {boolean} [props.withNames] show "ID — name" in the station options
 * @param {number} [props.marginBottom] spacing below the row, px
 */
function SeriesSelectors({ sel, setSel, vars, leads, stations, withNames = false, marginBottom = 8 }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom, flexWrap: 'wrap' }}>
      {stations && (
        <select aria-label="Station" value={sel.station} onChange={e => setSel(s => ({ ...s, station: e.target.value }))} className="btn btn-sm">
          {stations.length ? stations.map(s => <option key={s.station_id} value={s.station_id}>{s.station_id}{withNames ? ` — ${s.name}` : ''}</option>)
            : <option value="MYNN">MYNN</option>}
        </select>
      )}
      <select aria-label="Variable" value={sel.variable} onChange={e => setSel(s => ({ ...s, variable: e.target.value }))} className="btn btn-sm">
        {Object.entries(vars).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <select aria-label="Lead time" value={sel.lead_h} onChange={e => setSel(s => ({ ...s, lead_h: Number(e.target.value) }))} className="btn btn-sm">
        {leads.map(l => <option key={l} value={l}>+{l}h</option>)}
      </select>
    </div>
  )
}

// ── Station detail modal (opened by clicking a leaderboard row) ─────────────
/**
 * Dialog with one station's verification: per-variable error, category breakdown,
 * accuracy by lead time and its own forecast-vs-observed chart. Load errors leave the
 * dialog in its loading/empty state.
 * @param {{stationId: string, windowHours: number, onClose: function, openInfo: function}} props
 */
function StationDetailModal({ stationId, windowHours, onClose, openInfo }) {
  const [detail, setDetail] = useState(null)
  const [sel, setSel] = useState({ variable: 'temp_c', lead_h: 24 })
  const [series, setSeries] = useState(null)

  useEffect(() => {
    setDetail(null)
    if (stationId) api.verificationStation(stationId, windowHours).then(setDetail).catch(() => setDetail(null))
  }, [stationId, windowHours])
  useEffect(() => {
    if (stationId) api.verificationTimeseries(stationId, sel.variable, sel.lead_h).then(setSeries).catch(() => setSeries(null))
  }, [stationId, sel])
  if (!stationId) return null
  const d = detail || {}
  const vars = d.variables || {}
  const leads = (d.by_lead || []).map(r => r.lead_h)
  const selUnit = vars[sel.variable]?.unit || ''

  return (
    <Dialog open wide onClose={onClose} title={<>
      {d.station_id || stationId}{d.name ? ` — ${d.name}` : ''}
      {d.overall_accuracy_pct != null && (
        <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: accColor(d.overall_accuracy_pct) }}>
          {d.overall_accuracy_pct}% overall
        </span>
      )}
    </>}>

        {!detail && <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading station detail…</div>}

        {detail && (
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              {d.sample_size} verified forecasts · last {Math.round((d.window_hours || windowHours) / 24)} days
              {d.elevation_ft != null && ` · elevation ${d.elevation_ft} ft`}
            </div>

            {/* Per-variable accuracy (clickable) */}
            <div className="card-grid" style={{ marginBottom: 14 }}>
              {Object.entries(vars).map(([k, v]) => (
                <StatCard key={k} label={`${v.label} — avg error`}
                  value={v.mae == null ? '—' : `±${v.mae} ${v.unit}`} valueColor="var(--accent)"
                  detail={`${v.latest_obs != null ? `latest obs ${v.latest_obs} ${v.unit} · ` : ''}bias ${fmt(v.bias)} · RMSE ${fmt(v.rmse)} · n=${fmt(v.n)}`}
                  info={CARD_INFO[k]} openInfo={openInfo} />
              ))}
              <StatCard label="Flight Conditions" value={fmt(d.category_hit_rate, '%')} valueColor={accColor(d.category_hit_rate)}
                detail={`correct calls · n=${fmt(d.category_n)}`} info={CARD_INFO.category} openInfo={openInfo} />
            </div>

            {/* Flight-condition breakdown */}
            {d.category_breakdown && Object.keys(d.category_breakdown).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Correct calls by observed condition:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CAT_ORDER.filter(c => d.category_breakdown[c]).map(c => {
                    const b = d.category_breakdown[c]
                    const pct = b.n ? Math.round(100 * b.hit / b.n) : 0
                    return (
                      <span key={c} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: `1px solid ${CAT_TEXT_COLORS[c]}`, color: CAT_TEXT_COLORS[c] }}>
                        {c}: {pct}% <span style={{ color: 'var(--text-muted)' }}>({b.hit}/{b.n})</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Per-lead table */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-header"><h4 style={{ fontSize: 14 }}>Accuracy by Lead Time</h4></div>
              <LeadTable byLead={d.by_lead} openInfo={openInfo} marginTop={0} />
            </div>

            {/* Forecast vs observed for this station */}
            <div className="card">
              <div className="card-header"><h4 style={{ fontSize: 14 }}>Forecast vs. Observed</h4></div>
              <div style={{ padding: '8px 12px' }}>
                <SeriesSelectors sel={sel} setSel={setSel} vars={vars} leads={leads.length ? leads : DEFAULT_LEADS} />
                <ForecastVsObserved points={series?.points} unit={selUnit} />
              </div>
            </div>
          </div>
        )}
    </Dialog>
  )
}

/** The Forecast Verification page. */
export default function Verification() {
  // View state lives in the URL so "Copy link" on a chart reopens exactly this view.
  const [windowHours, setWindowHours] = useUrlState('window', 168, oneOf([24, 72, 168, 720]))
  const { data: sb, loading, refresh } = usePolling(useCallback(() => api.verificationScoreboard(windowHours), [windowHours]), 60000)
  const { data: stationsData } = usePolling(useCallback(() => api.verificationStations(windowHours), [windowHours]), 120000)
  const { data: corr } = usePolling(useCallback(() => api.verificationCorrection(720), []), 300000)
  const { data: brief } = usePolling(useCallback(() => api.briefing(), []), 300000)
  const { data: warn } = usePolling(useCallback(() => api.verificationWarnings(windowHours), [windowHours]), 120000)

  const [qStation, setQStation] = useUrlState('station', 'MYNN', (v) => (/^[A-Z]{4}$/.test(v) ? v : undefined))
  const [qVariable, setQVariable] = useUrlState('var', 'temp_c', (v) => (/^[a-z_]{1,30}$/.test(v) ? v : undefined))
  const [qLead, setQLead] = useUrlState('lead', 6, (v) => (/^\d{1,3}$/.test(v) ? Number(v) : undefined))
  const sel = useMemo(() => ({ station: qStation, variable: qVariable, lead_h: qLead }), [qStation, qVariable, qLead])
  /**
   * Updater-style setter for the chart selection, backed by three URL parameters.
   * Each control changes one field, so only one URL update is made per change.
   * @param {function(object): object} fn maps the current selection to the next
   */
  const setSel = (fn) => {
    const next = fn(sel)
    if (next.station !== sel.station) setQStation(next.station)
    else if (next.variable !== sel.variable) setQVariable(next.variable)
    else if (next.lead_h !== sel.lead_h) setQLead(next.lead_h)
  }
  const [series, setSeries] = useState(null)
  const [detailStation, setDetailStation] = useState(null)
  const [info, setInfo] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [leadExpanded, setLeadExpanded] = useState(false)
  /** Opens the explanation dialog. */
  const openInfo = (title, body) => setInfo({ title, body })

  useEffect(() => {
    api.verificationTimeseries(sel.station, sel.variable, sel.lead_h).then(setSeries).catch(() => setSeries(null))
  }, [sel])

  const board = sb || {}
  const mode = MODE_BADGE[board.data_mode] || MODE_BADGE.empty
  const vars = board.variables || {}
  const stations = stationsData?.stations || []
  const selUnit = vars[sel.variable]?.unit || ''
  const leadOptions = (board.by_lead || []).map(r => r.lead_h)
  const leads = leadOptions.length ? leadOptions : DEFAULT_LEADS

  return (
    <div className="page">
      <InfoModal info={info} onClose={() => setInfo(null)} />
      {detailStation && (
        <StationDetailModal stationId={detailStation} windowHours={windowHours} onClose={() => setDetailStation(null)} openInfo={openInfo} />
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>Forecast Verification</h2>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
            How accurate our forecasts were against what was actually observed — bias, error, and skill by lead time.
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}> Select any card, column header or station for an explanation or detail.</span>
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.5, color: '#fff', background: mode.color,
          }}>{mode.text}</span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, maxWidth: 240 }}>{mode.detail}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }} role="group" aria-labelledby="win-label">
        <span id="win-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Window:</span>
        {[{ h: 24, l: '24h' }, { h: 72, l: '3d' }, { h: 168, l: '7d' }, { h: 720, l: '30d' }].map(w => (
          <button key={w.h} type="button" aria-pressed={windowHours === w.h} className={`btn btn-sm ${windowHours === w.h ? 'btn-primary' : ''}`} onClick={() => setWindowHours(w.h)}>{w.l}</button>
        ))}
        <button type="button" className="btn btn-sm" onClick={refresh} style={{ marginLeft: 'auto' }}><span aria-hidden="true">↻</span> Refresh</button>
      </div>

      {/* Operations briefing synthesized from live data */}
      <BriefingCard data={brief} />

      {/* Headline stat cards (click for explanation) */}
      <div className="card-grid" style={{ marginBottom: 16 }}>
        <StatCard label="Overall Forecast Accuracy" value={fmt(board.overall_accuracy_pct, '%')}
          valueColor={accColor(board.overall_accuracy_pct)} detail={`${fmt(board.sample_size)} verified forecasts`}
          info={CARD_INFO.overall} openInfo={openInfo} />
        <StatCard label="Flight-Category Hit Rate" value={fmt(board.category_hit_rate, '%')}
          valueColor={accColor(board.category_hit_rate)} detail={`VFR / MVFR / IFR / LIFR · n=${fmt(board.category_n)}`}
          info={CARD_INFO.category} openInfo={openInfo} />
        {Object.entries(vars).map(([k, v]) => (
          <StatCard key={k} label={`${v.label} — avg error`}
            value={v.mae == null ? '—' : `±${v.mae} ${v.unit}`} valueColor="var(--accent)"
            detail={`bias ${fmt(v.bias)} · RMSE ${fmt(v.rmse)} · n=${fmt(v.n)}`}
            info={CARD_INFO[k]} openInfo={openInfo} />
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Lead-time skill curve */}
        <div className="card" id="chart-skill-lead">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>Skill vs. Lead Time<InfoDot title="Skill vs. Lead Time" onClick={() => openInfo('Skill vs. Lead Time', SECTION_INFO.lead)} /></h3>
            <button type="button" className="btn btn-sm" onClick={() => setLeadExpanded(true)} aria-label="Expand Skill vs. Lead Time chart"><span aria-hidden="true">⤢</span> Expand</button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <LeadCurve byLead={board.by_lead} />
            <LeadTable byLead={board.by_lead} openInfo={openInfo} />
            <ChartActions id="chart-skill-lead" title="Skill vs. lead time" filename={`skill-by-lead-${windowHours}h`}
              columns={['Lead (h)', 'Temperature MAE (°C)', 'Wind MAE (kt)', 'Category hit rate (%)', 'Verified pairs']}
              rows={(board.by_lead || []).map(r => [r.lead_h, r.temp_mae, r.wind_mae, r.cat_hit_rate, r.n])} />
          </div>
        </div>

        {/* Forecast vs observed */}
        <div className="card" id="chart-forecast-observed">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>Forecast vs. Observed<InfoDot title="Forecast vs. Observed" onClick={() => openInfo('Forecast vs. Observed', SECTION_INFO.fvo)} /></h3>
            <button type="button" className="btn btn-sm" onClick={() => setExpanded(true)} aria-label="Expand Forecast vs. Observed chart"><span aria-hidden="true">⤢</span> Expand</button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <SeriesSelectors sel={sel} setSel={setSel} vars={vars} leads={leads} stations={stations} />
            <ForecastVsObserved points={series?.points} unit={selUnit} />
            <ChartActions id="chart-forecast-observed" title={`Forecast vs. observed, ${sel.station}`}
              filename={`forecast-vs-observed-${sel.station}-${sel.variable}-${sel.lead_h}h`}
              columns={['Valid time (UTC)', `Forecast (${selUnit})`, `Observed (${selUnit})`, 'Difference']}
              rows={verifiedPairs(series?.points)
                .map(p => [p.valid_at, p.forecast_value, p.observed_value, +(p.forecast_value - p.observed_value).toFixed(2)])} />
          </div>
        </div>
      </div>

      {/* Expanded views */}
      <Dialog open={expanded} wide onClose={() => setExpanded(false)}
        title={`Forecast vs. Observed — ${sel.station} · ${vars[sel.variable]?.label || sel.variable} · +${sel.lead_h}h`}>
        <SeriesSelectors sel={sel} setSel={setSel} vars={vars} leads={leads} stations={stations} withNames marginBottom={10} />
        <ForecastVsObserved points={series?.points} unit={selUnit} big />
      </Dialog>
      <Dialog open={leadExpanded} wide onClose={() => setLeadExpanded(false)} title="Skill vs. Lead Time"
        actions={<InfoDot title="Skill vs. Lead Time" onClick={() => openInfo('Skill vs. Lead Time', SECTION_INFO.lead)} />}>
        <LeadCurve byLead={board.by_lead} big />
        <LeadTable byLead={board.by_lead} openInfo={openInfo} />
      </Dialog>

      {/* IFR/LIFR warning verification (safety-critical) */}
      <WarningSkillCard data={warn} openInfo={openInfo} />

      {/* Bias correction (MOS) raw vs corrected */}
      <CorrectionCard data={corr} openInfo={openInfo} />

      {/* Per-station leaderboard (rows clickable) */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 id="lb-h" style={{ display: 'flex', alignItems: 'center' }}>Station Accuracy Leaderboard<InfoDot title="Station Accuracy Leaderboard" onClick={() => openInfo('Station Accuracy Leaderboard', SECTION_INFO.leaderboard)} /></h3>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Select a station for full detail</span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="lb-h">
          <table className="data-table">
            <thead><tr>
              {Object.entries(LB_COL_INFO).map(([label, info]) => <Th key={label} label={label} info={info} openInfo={openInfo} />)}
            </tr></thead>
            <tbody>
              {stations.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No verified forecasts in this window yet.</td></tr>}
              {stations.map((s, i) => (
                <tr key={s.station_id} onClick={() => setDetailStation(s.station_id)} style={{ cursor: 'pointer' }}>
                  <td>{i + 1}</td>
                  <th scope="row"><button type="button" className="link-btn" aria-label={`${s.station_id} ${s.name}, open detail`}
                    onClick={e => { e.stopPropagation(); setDetailStation(s.station_id) }}>{s.station_id}</button></th>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.name}</td>
                  <td><span style={{ fontWeight: 700, color: accColor(s.accuracy_pct) }}>{fmt(s.accuracy_pct, '%')}</span></td>
                  <td>{fmtErr(s.temp_mae, '°C')}</td>
                  <td>{fmtErr(s.wind_mae, 'kt')}</td>
                  <td>{fmt(s.cat_hit_rate, '%')}</td>
                  <td>{fmt(s.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>
        Methodology: continuous variables (temperature, wind, pressure) scored by bias / MAE / RMSE against station METARs;
        flight category scored by exact-match hit rate. Lead-time curve shows forecast skill degrading with horizon —
        the standard operational verification view. {loading && 'Loading…'}
      </p>
    </div>
  )
}
