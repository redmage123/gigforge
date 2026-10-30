import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import CandleChart from '../components/trading/CandleChart'
import PriceLadder from '../components/trading/PriceLadder'
import OrderTicket from '../components/trading/OrderTicket'
import { QuoteBoard, TimeSales, Blotter, fmtPx, fmtUsd, fmtChg, pnlClass } from '../components/trading/Panels'
import '../components/trading/trading.css'

const TIMEFRAMES = [1, 5, 15]
const STALE_MS = 3000

const readPref = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const writePref = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/** Personalised trading stream: market data for all contracts + this user's account. */
function useTradingFeed(focus) {
  const [state, setState] = useState({ market: null, account: null, at: 0 })
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const focusRef = useRef(focus)

  useEffect(() => {
    let closed = false
    let timer
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const token = localStorage.getItem('token') || ''
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/trading?token=${encodeURIComponent(token)}`)
      ws.onopen = () => {
        setConnected(true)
        if (focusRef.current) ws.send(JSON.stringify({ focus: focusRef.current }))
      }
      ws.onclose = () => {
        setConnected(false)
        if (!closed) timer = setTimeout(connect, 2000)
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'trading_update') setState({ market: msg.market, account: msg.account, at: Date.now() })
        } catch { /* ignore malformed frame */ }
      }
      wsRef.current = ws
    }
    connect()
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close() }
  }, [])

  useEffect(() => {
    focusRef.current = focus
    if (focus && wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ focus }))
  }, [focus])

  return { ...state, connected }
}

/** Screen-reader announcer: polite for confirmations, assertive for failures. */
function useAnnouncer() {
  const [msgs, setMsgs] = useState({ polite: '', assertive: '' })
  const announce = useCallback((text, level = 'polite') => {
    // Clear first so repeating the same message is still announced.
    setMsgs(m => ({ ...m, [level]: '' }))
    setTimeout(() => setMsgs(m => ({ ...m, [level]: text })), 50)
  }, [])
  const regions = (
    <>
      <div className="tt-sr-only" role="status" aria-live="polite">{msgs.polite}</div>
      <div className="tt-sr-only" role="alert" aria-live="assertive">{msgs.assertive}</div>
    </>
  )
  return [announce, regions]
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export default function CarbonTrading() {
  const rootRef = useRef(null)
  const [symbol, setSymbol] = useState(null)
  const [minutes, setMinutes] = useState(1)
  const [preset, setPreset] = useState(null)
  const [recenter, setRecenter] = useState(0)
  const [cbSafe, setCbSafe] = useState(() => readPref('tt-cb-palette', '0') === '1')
  const [newsPaused, setNewsPaused] = useState(false)
  const [announce, liveRegions] = useAnnouncer()
  const { market, account, at, connected } = useTradingFeed(symbol)
  const now = useNow(1000)
  const stale = !connected || (at && now - at > STALE_MS)

  useEffect(() => {
    const prev = document.title
    document.title = `${symbol ? symbol + ' · ' : ''}Carbon Desk · SkyWatch`
    return () => { document.title = prev }
  }, [symbol])

  // Announce connection loss/restoration and new fills.
  const wasConnected = useRef(null)
  useEffect(() => {
    if (wasConnected.current === true && !connected) announce('Market data disconnected. Prices are stale; reconnecting.', 'assertive')
    if (wasConnected.current === false && connected) announce('Market data reconnected.')
    wasConnected.current = connected
  }, [connected, announce])
  const seenFills = useRef(null)
  useEffect(() => {
    const fills = account?.fills || []
    if (seenFills.current == null) { seenFills.current = fills.length; return }
    if (fills.length > seenFills.current) {
      const f = fills[0]
      announce(`Filled: ${f.side === 'BUY' ? 'bought' : 'sold'} ${f.qty} ${f.symbol} at ${f.price.toFixed(2)}`)
    }
    seenFills.current = fills.length
  }, [account?.fills, announce])

  const quotes = market?.quotes || []
  useEffect(() => { if (!symbol && quotes.length) setSymbol(quotes[0].symbol) }, [symbol, quotes])
  const quote = quotes.find(q => q.symbol === symbol)
  const depth = market?.depth?.[symbol]
  const tape = market?.tape?.[symbol]
  const position = account?.positions?.find(p => p.symbol === symbol)
  const working = useMemo(() => (account?.working_orders || []).filter(o => o.symbol === symbol), [account, symbol])

  const { data: specs } = usePolling(useCallback(() => api.tradingSpecs(), []), 600000)
  const { data: obligation, refresh: refreshObligation } = usePolling(useCallback(() => api.corsiaObligation(), []), 30000)
  const { data: candleData } = usePolling(
    useCallback(() => (symbol ? api.tradingCandles(symbol, minutes) : Promise.resolve(null)), [symbol, minutes]), 3000)
  const candlesReady = candleData?.symbol === symbol && candleData?.minutes === minutes
  const candles = candlesReady ? candleData.candles : []

  const chartLines = useMemo(() => {
    const lines = []
    if (position?.qty) lines.push({ price: position.avg_price, color: '#19c37d', label: `AVG ${position.qty > 0 ? '+' : ''}${position.qty}`, dash: '6 3' })
    for (const o of working) {
      const px = o.price ?? o.stop
      if (px != null) lines.push({ price: px, color: o.side === 'BUY' ? '#3aa5ff' : '#f45b6c', label: `${o.side === 'BUY' ? 'B' : 'S'}${o.remaining} ${o.type}` })
    }
    return lines
  }, [position, working])

  const submit = useCallback(async (order) => {
    const res = await api.tradingSubmit(order)
    refreshObligation()
    return res
  }, [refreshObligation])

  const cancelAt = useCallback(async (side, price) => {
    const hits = working.filter(o => o.side === side && Math.abs((o.price ?? o.stop) - price) < 0.005)
    if (!hits.length) return
    await Promise.all(hits.map(o => api.tradingCancel(o.id).catch(() => {})))
    announce(`Cancelled ${hits.length} ${side === 'BUY' ? 'bid' : 'offer'}${hits.length > 1 ? 's' : ''} at ${price.toFixed(2)}`)
  }, [working, announce])

  const place = useCallback((side, price) => {
    setPreset({ side, type: 'LMT', price, nonce: Date.now() })
    announce(`Ticket loaded: ${side} limit at ${price.toFixed(2)}. Review and submit in the order ticket.`)
  }, [announce])

  const hedge = useCallback((sym, qty) => {
    const q = quotes.find(x => x.symbol === sym)
    setSymbol(sym)
    setPreset({ side: 'BUY', type: 'LMT', qty, price: q?.ask, nonce: Date.now() })
    announce(`Hedge loaded into the order ticket: buy ${qty} ${sym}. Review and submit.`)
  }, [quotes, announce])

  const toggleCb = () => { setCbSafe(v => { writePref('tt-cb-palette', v ? '0' : '1'); return !v }) }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else rootRef.current?.requestFullscreen?.()
  }

  const news = market?.news || []
  const newsClock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className={`tt-root ${cbSafe ? 'tt-cb' : ''} ${stale ? 'tt-stale' : ''}`} ref={rootRef}>
      <h1 className="tt-sr-only">Carbon Desk — simulated carbon offset futures trading</h1>
      {liveRegions}

      {/* ── Top bar ── */}
      <header className="tt-topbar tt-area-top">
        <span className="tt-brand">CARBON DESK</span>
        <span className="tt-sim-badge" title="Synthetic prices from an in-process exchange. Not connected to CME Group.">
          SIMULATED · NOT CONNECTED TO CME
        </span>
        <span className={`tt-conn ${stale ? 'off' : ''}`} role="status">{!at ? 'CONNECTING…' : stale ? 'STALE — RECONNECTING' : 'LIVE'}</span>
        <div className="tt-metrics" aria-label="Account summary">
          <span className="tt-hide-md"><Clock /></span>
          <div className="tt-metric"><label>Net liq</label><span>{fmtUsd(account?.equity)}</span></div>
          <div className="tt-metric"><label>Day P&amp;L</label><span className={pnlClass(account?.day_pnl)}>{fmtUsd(account?.day_pnl, true)}</span></div>
          <div className="tt-metric tt-hide-md"><label>Unrealized</label><span className={pnlClass(account?.unrealized_pnl)}>{fmtUsd(account?.unrealized_pnl, true)}</span></div>
          <div className="tt-metric"><label>Margin</label><span>{fmtUsd(account?.margin_used)}</span></div>
          <div className="tt-metric"><label>Buying power</label><span>{fmtUsd(account?.buying_power)}</span></div>
        </div>
        <button type="button" className="tt-icon-btn" aria-pressed={cbSafe} onClick={toggleCb} aria-label="Colour-blind-safe palette"
          title="Swap green/red for a blue/orange palette that is distinguishable with colour-vision deficiency">
          ◐<span className="tt-btn-text"> {cbSafe ? 'Colour-safe on' : 'Colour-safe'}</span>
        </button>
        <button type="button" className="tt-icon-btn" onClick={toggleFullscreen} title="Full screen (Esc to exit)" aria-label="Full screen">
          ⛶<span className="tt-btn-text"> Full screen</span>
        </button>
      </header>

      {/* ── Quote board ── */}
      <section className="tt-panel tt-area-quotes" aria-labelledby="tt-h-quotes">
        <div className="tt-panel-head"><h2 id="tt-h-quotes">Quote board</h2><span className="tt-spacer" />USD / offset</div>
        <div className="tt-panel-body">
          <QuoteBoard quotes={quotes} selected={symbol} onSelect={setSymbol} />
        </div>
      </section>

      {/* ── Chart ── */}
      <section className="tt-panel tt-area-chart" aria-labelledby="tt-h-chart">
        <div className="tt-panel-head tt-chart-head">
          {quote ? (
            <div className="tt-headline">
              <h2 id="tt-h-chart" className="sym">{quote.symbol}</h2>
              <span className="tt-dim sub">{quote.month}</span>
              {quote.corsia_eligible && <span className="tt-pill corsia sub">CORSIA</span>}
              <span className={`px ${pnlClass(quote.change)}`} aria-label={`Last ${fmtPx(quote.last)}`}>{fmtPx(quote.last)}</span>
              <span className={`num ${pnlClass(quote.change)}`}>{fmtChg(quote.change)} ({quote.change_pct > 0 ? '+' : ''}{quote.change_pct}%)</span>
            </div>
          ) : <h2 id="tt-h-chart">Connecting to market…</h2>}
          <span className="tt-spacer" />
          <div className="tt-seg" role="group" aria-label="Candle interval">
            {TIMEFRAMES.map(m => (
              <button type="button" key={m} className={m === minutes ? 'on' : ''} aria-pressed={m === minutes}
                aria-label={`${m} minute candles`} onClick={() => setMinutes(m)}>{m}m</button>
            ))}
          </div>
        </div>
        {quote && (
          <div className="tt-statbar" title={quote.name}>
            <span>Bid <b style={{ color: 'var(--tt-bid)' }}>{fmtPx(quote.bid)}</b> × {quote.bid_size}</span>
            <span>Ask <b style={{ color: 'var(--tt-ask)' }}>{fmtPx(quote.ask)}</b> × {quote.ask_size}</span>
            <span>H <b>{fmtPx(quote.high)}</b></span>
            <span>L <b>{fmtPx(quote.low)}</b></span>
            <span>Settle <b>{fmtPx(quote.settle)}</b></span>
            <span>Vol <b>{quote.volume.toLocaleString()}</b></span>
            <span>OI <b>{quote.open_interest.toLocaleString()}</b></span>
            <span className="tt-dim">{quote.name}</span>
          </div>
        )}
        <CandleChart candles={candles} last={quote?.last} lines={chartLines} loading={!candlesReady}
          label={quote ? `${quote.symbol} ${quote.month} ${minutes}-minute candles` : 'Price chart'} />
      </section>

      {/* ── DOM ladder ── */}
      <section className="tt-panel tt-area-ladder" aria-labelledby="tt-h-dom">
        <div className="tt-panel-head">
          <h2 id="tt-h-dom">Depth of market</h2>
          <span className="tt-spacer" />
          <span className={pnlClass(position?.qty)}>
            {position?.qty ? `${position.qty > 0 ? 'LONG +' : 'SHORT '}${position.qty}` : 'FLAT'}
          </span>
          <button type="button" className="tt-link-btn" onClick={() => setRecenter(n => n + 1)} title="Centre on the inside market (Home)">⌖ Centre</button>
        </div>
        <PriceLadder quote={quote} depth={depth} workingOrders={working} position={position}
          onPlace={place} onCancelAt={cancelAt} recenterSignal={recenter} />
      </section>

      {/* ── Time & sales ── */}
      <section className="tt-panel tt-area-tape" aria-labelledby="tt-h-tape">
        <div className="tt-panel-head"><h2 id="tt-h-tape">Time &amp; sales</h2><span className="tt-spacer" />{symbol}</div>
        <div className="tt-panel-body" tabIndex={0} aria-label="Time and sales, scrollable"><TimeSales trades={tape} symbol={symbol} /></div>
      </section>

      {/* ── Blotter ── */}
      <section className="tt-panel tt-area-blotter" aria-label="Account blotter">
        <Blotter account={account} obligation={obligation} specs={specs}
          onCancel={async (id) => { try { await api.tradingCancel(id); announce(`Order ${id} cancelled`) } catch (e) { announce(e.message, 'assertive') } }}
          onCancelAll={async () => { const r = await api.tradingCancelAll().catch(() => null); announce(`${r?.cancelled ?? 0} orders cancelled`) }}
          onFlatten={async (sym) => { try { await api.tradingFlatten(sym); announce(`${sym} position flattened at market`) } catch (e) { announce(e.message, 'assertive') } }}
          onSelect={setSymbol} onHedge={hedge} />
      </section>

      {/* ── Order ticket ── */}
      <section className="tt-panel tt-area-ticket" aria-labelledby="tt-h-ticket">
        <div className="tt-panel-head"><h2 id="tt-h-ticket">Order ticket</h2><span className="tt-spacer" />{symbol}</div>
        <div className="tt-panel-body">
          <OrderTicket quote={quote} preset={preset} onSubmit={submit} announce={announce} />
        </div>
      </section>

      {/* ── News strip ── */}
      <section className="tt-news tt-area-news" aria-label="Market headlines">
        <span className="tt-news-label" aria-hidden="true">NEWS</span>
        <div className={`tt-ticker ${newsPaused ? 'paused' : ''}`} aria-hidden="true">
          <div className="tt-ticker-inner">
            {news.length === 0 && <span className="tt-ticker-item">Awaiting market headlines…</span>}
            {news.map(n => (
              <span key={n.time} className="tt-ticker-item">
                <time>{newsClock(n.time)}</time>
                <b className={n.impact === 'bullish' ? 'tt-up' : 'tt-down'}>{n.impact === 'bullish' ? '▲' : '▼'} {n.product}</b>{n.headline}
              </span>
            ))}
          </div>
        </div>
        {/* Static, readable list for assistive technology (the scrolling copy is hidden from it). */}
        <ul className="tt-sr-only">
          {news.map(n => <li key={n.time}>{newsClock(n.time)}, {n.product}, {n.impact}: {n.headline}</li>)}
        </ul>
        <button type="button" className="tt-news-btn" onClick={() => setNewsPaused(p => !p)}
          aria-label={newsPaused ? 'Resume scrolling headlines' : 'Pause scrolling headlines'}>{newsPaused ? '▶' : '❚❚'}</button>
      </section>
    </div>
  )
}

function Clock() {
  const now = useNow(1000)
  return (
    <div className="tt-metric">
      <label>Chicago (CT)</label>
      <span><time>{new Date(now).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour12: false })}</time></span>
    </div>
  )
}
