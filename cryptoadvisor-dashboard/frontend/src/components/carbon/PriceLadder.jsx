import { useEffect, useMemo, useRef, useState } from 'react'

const TICK = 0.01
const ROW_H = 21
const HEAD_H = 23
const EDGE_ROWS = 2        // recentre only when the market gets this close to an edge
const key = (p) => Math.round(p / TICK)
const fmt = (k) => (k * TICK).toFixed(2)

function useHeight(ref) {
  const [h, setH] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return h
}

/**
 * Depth-of-market price ladder.
 *
 * Mouse: click the BIDS column to load a buy limit at that price, ASKS for a sell
 * limit; click your own working size to cancel it.
 * Keyboard: ↑/↓ move the price cursor (PgUp/PgDn ±5), Home jumps to the inside
 * market, B or Enter loads a buy limit, S a sell limit, C or Delete cancels your
 * orders at the cursor price. The cursor row is announced to screen readers.
 *
 * The ladder does not scroll with every tick — prices stay put under the pointer
 * and it recentres only when the inside market nears an edge (or on ⌖ / Home).
 */
export default function PriceLadder({ quote, depth, workingOrders, position, onPlace, onCancelAt, recenterSignal }) {
  const wrapRef = useRef(null)
  const height = useHeight(wrapRef)
  const [center, setCenter] = useState(null)
  const [cursor, setCursor] = useState(null)
  const symbolRef = useRef(null)

  const half = Math.max(3, Math.floor((Math.max(0, height - HEAD_H) / ROW_H - 1) / 2))
  const bb = quote?.bid != null ? key(quote.bid) : null
  const ba = quote?.ask != null ? key(quote.ask) : null
  const mid = quote ? (bb != null && ba != null ? Math.round((bb + ba) / 2) : key(quote.last)) : null

  // Recentre on contract change, explicit request, or when the market nears an edge.
  useEffect(() => {
    if (mid == null) return
    if (symbolRef.current !== quote.symbol) {
      symbolRef.current = quote.symbol
      setCenter(mid)
      setCursor(null)
    } else if (center == null || Math.abs(mid - center) > half - EDGE_ROWS) {
      setCenter(mid)
    }
  }, [mid, quote?.symbol, half, center])
  useEffect(() => { if (mid != null) setCenter(mid) }, [recenterSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (center == null) return []
    const bids = new Map((depth?.bids || []).map(l => [key(l.price), l.size]))
    const asks = new Map((depth?.asks || []).map(l => [key(l.price), l.size]))
    const myBids = new Map(), myAsks = new Map()
    for (const o of workingOrders || []) {
      const px = o.price ?? o.stop
      if (px == null) continue
      const m = o.side === 'BUY' ? myBids : myAsks
      m.set(key(px), (m.get(key(px)) || 0) + o.remaining)
    }
    const maxSize = Math.max(1, ...bids.values(), ...asks.values())
    const out = []
    for (let k = center + half; k >= center - half; k--) {
      out.push({
        k, bid: bids.get(k), ask: asks.get(k), myBid: myBids.get(k), myAsk: myAsks.get(k), maxSize,
        insideBid: k === bb, insideAsk: k === ba,
        last: quote && k === key(quote.last),
        avg: position?.qty && k === key(position.avg_price),
      })
    }
    return out
  }, [center, half, depth, workingOrders, position, bb, ba, quote])

  const cur = rows.find(r => r.k === cursor)
  const describe = (r) => r ? `${fmt(r.k)}: ${r.bid ? `bid ${r.bid}` : 'no bid'}, ${r.ask ? `ask ${r.ask}` : 'no ask'}`
    + `${r.myBid ? `, your bids ${r.myBid}` : ''}${r.myAsk ? `, your offers ${r.myAsk}` : ''}`
    + `${r.last ? ', last traded' : ''}${r.insideBid ? ', best bid' : ''}${r.insideAsk ? ', best ask' : ''}` : ''

  const onKeyDown = (e) => {
    if (mid == null) return
    const at = cursor ?? mid
    const move = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key]
    if (move) {
      e.preventDefault()
      const next = at + move
      setCursor(next)
      if (Math.abs(next - center) > half) setCenter(next)
      return
    }
    const k = e.key.toLowerCase()
    if (e.key === 'Home') { e.preventDefault(); setCenter(mid); setCursor(mid) }
    else if (k === 'b' || e.key === 'Enter') { e.preventDefault(); onPlace('BUY', at * TICK) }
    else if (k === 's') { e.preventDefault(); onPlace('SELL', at * TICK) }
    else if (k === 'c' || e.key === 'Delete') {
      e.preventDefault()
      onCancelAt('BUY', at * TICK)
      onCancelAt('SELL', at * TICK)
    }
  }

  return (
    <div className="tt-ladder-wrap" ref={wrapRef} tabIndex={0} role="group"
      aria-label={`Depth of market for ${quote?.symbol || 'selected contract'}`}
      aria-describedby="tt-ladder-help" onKeyDown={onKeyDown}
      onFocus={() => cursor == null && mid != null && setCursor(mid)}>
      <span id="tt-ladder-help" className="tt-sr-only">
        Use up and down arrows to move the price cursor. Press B or Enter to load a buy limit order at that price,
        S for a sell limit, C to cancel your orders at that price, Home to return to the inside market.
      </span>
      <div className="tt-sr-only" aria-live="polite">{describe(cur)}</div>
      <table className="tt-ladder" aria-hidden="true">
        <thead>
          <tr><th className="c-my">My</th><th className="c-bid">Bids</th><th className="c-px">Price</th><th className="c-ask">Asks</th><th className="c-my">My</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.k} className={[r.insideBid && 'inside-bid', r.insideAsk && 'inside-ask', r.last && 'last',
              r.avg && 'avg', r.k === cursor && 'cursor'].filter(Boolean).join(' ')}>
              <td className={`c-my ${r.myBid ? 'has' : ''}`} title={r.myBid ? 'Cancel my bids at this price' : undefined}
                onClick={() => r.myBid && onCancelAt('BUY', r.k * TICK)}>{r.myBid ? `${r.myBid} ✕` : ''}</td>
              <td className="c-bid" title={`Load BUY limit @ ${fmt(r.k)}`} onClick={() => { setCursor(r.k); onPlace('BUY', r.k * TICK) }}>
                {r.bid && <span className="bar" style={{ width: `${(r.bid / r.maxSize) * 100}%` }} />}
                {r.bid || ''}
              </td>
              <td className="c-px">{fmt(r.k)}</td>
              <td className="c-ask" title={`Load SELL limit @ ${fmt(r.k)}`} onClick={() => { setCursor(r.k); onPlace('SELL', r.k * TICK) }}>
                {r.ask && <span className="bar" style={{ width: `${(r.ask / r.maxSize) * 100}%` }} />}
                {r.ask || ''}
              </td>
              <td className={`c-my ${r.myAsk ? 'has' : ''}`} title={r.myAsk ? 'Cancel my offers at this price' : undefined}
                onClick={() => r.myAsk && onCancelAt('SELL', r.k * TICK)}>{r.myAsk ? `${r.myAsk} ✕` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
