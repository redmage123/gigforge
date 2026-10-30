import { useEffect, useRef, useState } from 'react'

export const fmtPx = (p) => (p == null ? '—' : Number(p).toFixed(2))
export const fmtUsd = (v, signed = false) => {
  if (v == null) return '—'
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (v < 0 ? '-$' : signed && v > 0 ? '+$' : '$') + s
}
export const pnlClass = (v) => (v > 0 ? 'tt-up' : v < 0 ? 'tt-down' : '')
/** Direction glyph so up/down never relies on colour alone (WCAG 1.4.1). */
export const arrow = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '■')
export const fmtChg = (v) => (v == null ? '—' : `${arrow(v)} ${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`)
const fmtClock = (iso) => new Date(iso).toLocaleTimeString([], { hour12: false })

const PRODUCT_LABELS = {
  GEO: ['GEO', 'Global Emissions Offset · CORSIA-eligible'],
  NGO: ['N-GEO', 'Nature-Based Global Emissions Offset'],
  CGO: ['C-GEO', 'Core Global Emissions Offset'],
}

/** Two-step destructive action: first click arms (3 s), second click executes. */
export function ConfirmButton({ onConfirm, children, confirmText = 'Confirm?', className = 'tt-link-btn danger', label }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} aria-label={armed ? `${label}: press again to confirm` : label}
      onClick={(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm() } else setArmed(true) }}>
      {armed ? confirmText : children}
    </button>
  )
}

/** Quote board: every listed contract, grouped by product, with tick flashes. */
export function QuoteBoard({ quotes, selected, onSelect }) {
  const prev = useRef({})
  const groups = {}
  for (const q of quotes) (groups[q.product] ||= []).push(q)

  const flash = (q) => {
    const p = prev.current[q.symbol]
    prev.current[q.symbol] = q.last
    if (p == null || p === q.last) return ''
    return q.last > p ? 'tt-flash-up' : 'tt-flash-down'
  }

  if (!quotes.length) return <div className="tt-empty" role="status">Connecting to market data…</div>

  return (
    <table className="tt-table">
      <caption className="tt-sr-only">Quotes for all listed carbon offset futures. Activate a contract to trade it.</caption>
      <thead>
        <tr>
          <th scope="col">Contract</th><th scope="col">Last</th><th scope="col">Chg</th>
          <th scope="col">Bid</th><th scope="col">Ask</th>
          <th scope="col" className="tt-col-wide">Vol</th>
        </tr>
      </thead>
      {Object.entries(groups).map(([product, rows]) => (
        <tbody key={product}>
          <tr className="tt-group-row">
            <th scope="colgroup" colSpan={6}>
              {PRODUCT_LABELS[product]?.[0] || product}<small>{PRODUCT_LABELS[product]?.[1]}</small>
            </th>
          </tr>
          {rows.map(q => {
            const sel = q.symbol === selected
            return (
              <tr key={q.symbol} className={`tt-row-click ${sel ? 'tt-selected' : ''}`} onClick={() => onSelect(q.symbol)}
                title={`Volume ${q.volume.toLocaleString()} · Open interest ${q.open_interest.toLocaleString()}`}>
                <th scope="row">
                  <button type="button" className="tt-quote-btn" aria-pressed={sel}
                    aria-label={`${q.symbol}, ${q.month}${sel ? ', selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onSelect(q.symbol) }}>
                    <b style={{ color: 'var(--tt-text)', fontFamily: 'var(--tt-mono)' }}>{q.symbol}</b>
                    <span className="tt-dim" style={{ fontFamily: 'var(--tt-mono)', fontSize: 11 }}>{q.month}</span>
                  </button>
                </th>
                <td key={q.symbol + q.last + q.volume} className={flash(q)}>{fmtPx(q.last)}</td>
                <td className={pnlClass(q.change)}>{fmtChg(q.change)}</td>
                <td style={{ color: 'var(--tt-bid)' }}>{fmtPx(q.bid)}<span className="tt-size"> ×{q.bid_size}</span></td>
                <td style={{ color: 'var(--tt-ask)' }}>{fmtPx(q.ask)}<span className="tt-size"> ×{q.ask_size}</span></td>
                <td className="tt-col-wide tt-dim">{q.volume.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}

/** Time & sales tape for the focused contract. */
export function TimeSales({ trades, symbol }) {
  if (!trades?.length) return <div className="tt-empty" role="status">No trades yet in {symbol}.</div>
  return (
    <table className="tt-table">
      <caption className="tt-sr-only">Most recent trades in {symbol}, newest first.</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Price</th><th scope="col">Size</th><th scope="col">Aggressor</th></tr></thead>
      <tbody>
        {trades.map(t => {
          const buy = t.aggressor === 'BUY'
          return (
            <tr key={t.id}>
              <td className="tt-dim">{fmtClock(t.time)}</td>
              <td className={buy ? 'tt-up' : 'tt-down'}>{fmtPx(t.price)}</td>
              <td style={{ fontWeight: t.qty >= 25 ? 700 : 400 }}>{t.qty}</td>
              <td className={buy ? 'tt-up' : 'tt-down'}>{buy ? 'BUY ▲' : 'SELL ▼'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const Side = ({ side }) => <span className={`tt-pill ${side === 'BUY' ? 'buy' : 'sell'}`}>{side}</span>
const Empty = ({ children }) => <div className="tt-empty">{children}</div>
const orderPx = (o) => (o.type === 'MKT' || o.type === 'STP' ? 'MKT' : fmtPx(o.price))

function PositionsTab({ account, onFlatten, onSelect }) {
  const rows = account?.positions || []
  if (!rows.length) return <Empty>No positions. Click a price in the <b>Depth of Market</b> or use the <b>Order Ticket</b> to trade.</Empty>
  return (
    <table className="tt-table">
      <caption className="tt-sr-only">Open and closed positions today</caption>
      <thead><tr>
        <th scope="col">Contract</th><th scope="col">Net</th><th scope="col">Offsets</th><th scope="col">Avg</th><th scope="col">Mark</th>
        <th scope="col">Unrealized</th><th scope="col">Realized</th><th scope="col">Margin</th><th scope="col"><span className="tt-sr-only">Actions</span></th>
      </tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.symbol} className="tt-row-click" onClick={() => onSelect(p.symbol)}>
            <td><b>{p.symbol}</b></td>
            <td className={pnlClass(p.qty)}>{p.qty > 0 ? 'LONG +' : p.qty < 0 ? 'SHORT ' : 'FLAT '}{p.qty || ''}</td>
            <td>{p.offsets.toLocaleString()}</td>
            <td>{p.qty ? p.avg_price.toFixed(4) : '—'}</td>
            <td>{fmtPx(p.mark)}</td>
            <td className={pnlClass(p.unrealized_pnl)}>{fmtUsd(p.unrealized_pnl, true)}</td>
            <td className={pnlClass(p.realized_pnl)}>{fmtUsd(p.realized_pnl, true)}</td>
            <td className="tt-dim">{fmtUsd(p.margin)}</td>
            <td>{p.qty !== 0 && (
              <ConfirmButton label={`Flatten ${p.symbol}`} confirmText="Confirm flatten" onConfirm={() => onFlatten(p.symbol)}>Flatten</ConfirmButton>
            )}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OrdersTab({ orders, onCancel, cancellable }) {
  if (!orders?.length) return <Empty>{cancellable ? 'No working orders.' : 'No orders yet today.'}</Empty>
  return (
    <table className="tt-table">
      <caption className="tt-sr-only">{cancellable ? 'Working orders' : 'Order history'}</caption>
      <thead><tr>
        <th scope="col">#</th><th scope="col">Contract</th><th scope="col">Side</th><th scope="col">Type</th><th scope="col">Qty</th>
        <th scope="col">Filled</th><th scope="col">Limit</th><th scope="col">Stop</th><th scope="col">TIF</th><th scope="col" className="tt-left">Status</th>
        {cancellable && <th scope="col"><span className="tt-sr-only">Actions</span></th>}
      </tr></thead>
      <tbody>
        {orders.map(o => (
          <tr key={o.id}>
            <td className="tt-dim">{o.id}</td>
            <td><b>{o.symbol}</b></td>
            <td><Side side={o.side} /></td>
            <td>{o.type}</td>
            <td>{o.qty}</td>
            <td>{o.filled}{o.avg_fill ? <span className="tt-dim"> @{o.avg_fill.toFixed(4)}</span> : ''}</td>
            <td>{orderPx(o)}</td>
            <td>{fmtPx(o.stop)}</td>
            <td className="tt-dim">{o.tif}</td>
            <td className="tt-left">
              <span className={`tt-pill status ${o.status}`}>{o.status}</span>
              {o.reason && <span className="tt-reason" title={o.reason}> {o.reason}</span>}
            </td>
            {cancellable && <td><button type="button" className="tt-link-btn danger" aria-label={`Cancel order ${o.id}`} onClick={() => onCancel(o.id)}>Cancel</button></td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FillsTab({ fills }) {
  if (!fills?.length) return <Empty>No fills yet today.</Empty>
  return (
    <table className="tt-table">
      <caption className="tt-sr-only">Fills, newest first</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Contract</th><th scope="col">Side</th><th scope="col">Qty</th><th scope="col">Price</th><th scope="col">Liquidity</th><th scope="col">Fee</th><th scope="col">Order</th></tr></thead>
      <tbody>
        {fills.map((f, i) => (
          <tr key={f.order_id + '-' + i}>
            <td className="tt-dim">{fmtClock(f.time)}</td>
            <td><b>{f.symbol}</b></td>
            <td><Side side={f.side} /></td>
            <td>{f.qty}</td>
            <td>{fmtPx(f.price)}</td>
            <td className="tt-dim">{f.liquidity === 'ADD' ? 'Maker' : 'Taker'}</td>
            <td className="tt-dim">{fmtUsd(f.fee)}</td>
            <td className="tt-dim">#{f.order_id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HedgeTab({ obligation, onHedge }) {
  if (!obligation) return <Empty>Calculating the CORSIA obligation from live Bahamas FIR traffic…</Empty>
  const o = obligation
  const qty = Math.min(500, o.contracts_to_hedge)
  const covered = o.contracts_to_hedge === 0
  return (
    <div className="tt-hedge">
      <div className="tt-metric"><label>Flights in FIR now</label><span>{o.tracked_flights}</span></div>
      <div className="tt-metric"><label>Annualised CO₂</label><span>{o.annualised_co2_tonnes.toLocaleString()} t</span></div>
      <div className="tt-metric"><label>Offsets required</label><span>{o.required_offsets.toLocaleString()}</span></div>
      <div className="tt-metric"><label>Hedged · long GEO</label><span className="tt-up">{o.hedged_offsets.toLocaleString()}</span></div>
      <div className="tt-hedge-bar" role="progressbar" aria-label="CORSIA obligation hedged"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, o.coverage_pct)} aria-valuetext={`${o.coverage_pct}% hedged`}>
        <div style={{ width: `${Math.min(100, o.coverage_pct)}%` }} />
      </div>
      <div className="tt-metric"><label>Coverage</label><span>{o.coverage_pct}%</span></div>
      <div className="tt-metric"><label>Est. cost at offer</label><span>{covered ? '—' : fmtUsd(o.hedge_cost_estimate)}</span></div>
      <div className="tt-hedge-action">
        {covered ? <span className="tt-up" style={{ fontWeight: 700 }}>✓ Obligation fully hedged</span> : (
          <button type="button" className="tt-submit buy" style={{ padding: '7px 16px' }} onClick={() => onHedge(o.hedge_symbol, qty)}
            aria-label={`Load a buy order for ${qty} ${o.hedge_symbol} contracts into the order ticket`}>
            Load hedge ticket · BUY {qty} {o.hedge_symbol}
          </button>
        )}
      </div>
      <p className="tt-hedge-note">
        Requirement = CO₂ from aircraft now in the Bahamas FIR (CORSIA fuel-burn × 3.16), annualised from this snapshot,
        × an illustrative {Math.round(o.offset_ratio * 100)}% sector growth factor. Only long <b>GEO</b> positions count:
        it is the CORSIA-eligible contract (Verra / ACR / CAR units). The hedge loads into the ticket for review — nothing is sent until you submit.
      </p>
    </div>
  )
}

function SpecsTab({ specs }) {
  if (!specs) return <Empty>Loading contract specifications…</Empty>
  return (
    <table className="tt-table">
      <caption className="tt-sr-only">Contract specifications</caption>
      <thead><tr><th scope="col">Product</th><th scope="col">Contract unit</th><th scope="col">Tick</th><th scope="col">Tick value</th><th scope="col">Init. margin</th><th scope="col" className="tt-left">Settlement</th><th scope="col" className="tt-left">Listed (sim)</th></tr></thead>
      <tbody>
        {specs.products.map(p => (
          <tr key={p.product}>
            <td><b>{p.product}</b> <span className="tt-dim">{p.name}</span> {p.corsia_eligible && <span className="tt-pill corsia">CORSIA</span>}</td>
            <td>{p.contract_size.toLocaleString()} offsets</td>
            <td>${p.tick.toFixed(2)}</td>
            <td>${p.tick_value.toFixed(2)}</td>
            <td>{fmtUsd(p.initial_margin)}</td>
            <td className="tt-left tt-dim">{p.settlement}</td>
            <td className="tt-left tt-dim">{p.listed.join(' ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Bottom blotter with positions / orders / fills / CORSIA hedge / specs tabs (ARIA tabs pattern). */
export function Blotter({ account, obligation, specs, onCancel, onCancelAll, onFlatten, onSelect, onHedge }) {
  const [tab, setTab] = useState('positions')
  const tabRefs = useRef({})
  const working = account?.working_orders || []
  const openPositions = (account?.positions || []).filter(p => p.qty !== 0).length
  const tabs = [
    ['positions', 'Positions', openPositions],
    ['working', 'Working', working.length],
    ['fills', 'Fills', account?.fills?.length || 0],
    ['history', 'History', 0],
    ['hedge', 'CORSIA', 0],
    ['specs', 'Specs', 0],
  ]
  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t[0] === tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (next == null) return
    e.preventDefault()
    const id = tabs[(next + tabs.length) % tabs.length][0]
    setTab(id)
    tabRefs.current[id]?.focus()
  }
  return (
    <>
      <div className="tt-tabs-bar">
      <div className="tt-tabs" role="tablist" aria-label="Account blotter" onKeyDown={onKeyDown}>
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" id={`tt-tab-${id}`} aria-selected={tab === id} aria-controls="tt-blotter-panel"
            tabIndex={tab === id ? 0 : -1} ref={el => { tabRefs.current[id] = el }}
            className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n ? <span className="count" aria-label={`, ${n}`}>{n}</span> : null}
          </button>
        ))}
      </div>
        {working.length > 0 && (
          <div className="tt-tabs-actions">
            <ConfirmButton label="Cancel all working orders" confirmText={`Cancel ${working.length}?`} onConfirm={onCancelAll}>
              Cancel all
            </ConfirmButton>
          </div>
        )}
      </div>
      <div className="tt-panel-body" role="tabpanel" id="tt-blotter-panel" aria-labelledby={`tt-tab-${tab}`} tabIndex={0}>
        {tab === 'positions' && <PositionsTab account={account} onFlatten={onFlatten} onSelect={onSelect} />}
        {tab === 'working' && <OrdersTab orders={working} onCancel={onCancel} cancellable />}
        {tab === 'fills' && <FillsTab fills={account?.fills} />}
        {tab === 'history' && <OrdersTab orders={account?.order_history} />}
        {tab === 'hedge' && <HedgeTab obligation={obligation} onHedge={onHedge} />}
        {tab === 'specs' && <SpecsTab specs={specs} />}
      </div>
    </>
  )
}
