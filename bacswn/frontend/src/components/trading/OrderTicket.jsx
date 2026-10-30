import { useEffect, useRef, useState } from 'react'

const CONTRACT_SIZE = 1000
const MAX_QTY = 500
const QTY_PRESETS = [1, 5, 10, 25, 50]
const CONFIRM_QTY = 100            // ask for a second click at or above this size…
const CONFIRM_NOTIONAL = 250_000   // …or this notional (USD)
const STOP_TYPES = new Set(['STP', 'STL'])

/**
 * Order ticket. `preset` ({side, price, type, qty, nonce}) lets the ladder / hedge panel
 * pre-fill it; the nonce makes repeated identical presets still apply.
 *
 * The limit price follows the touch (best bid for a buy, best offer for a sell) until
 * the user edits it, so the field always shows exactly what will be sent.
 */
export default function OrderTicket({ quote, preset, onSubmit, announce }) {
  const [side, setSide] = useState('BUY')
  const [qtyText, setQtyText] = useState('5')
  const [type, setType] = useState('LMT')
  const [tif, setTif] = useState('DAY')
  const [price, setPrice] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)
  const [stop, setStop] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [armed, setArmed] = useState(false)
  const [pulse, setPulse] = useState(0)
  const msgTimer = useRef(null)

  // New contract: forget the old prices so they can't be sent to another market.
  // Declared before the preset effect: when both change together (hedge button),
  // the preset must win, and effects run in declaration order.
  useEffect(() => { setPrice(''); setPriceTouched(false); setStop(''); setMsg(null); setArmed(false) }, [quote?.symbol])

  useEffect(() => {
    if (!preset) return
    if (preset.side) setSide(preset.side)
    if (preset.type) setType(preset.type)
    if (preset.qty) setQtyText(String(preset.qty))
    if (preset.price != null) { setPrice(preset.price.toFixed(2)); setPriceTouched(true) }
    setArmed(false)
    setPulse(n => n + 1)
  }, [preset])

  // Untouched limit price tracks the touch for the chosen side.
  const touch = side === 'BUY' ? quote?.bid : quote?.ask
  // Frozen while a large-order confirmation is pending, so the price can't move
  // between the user reading the confirm button and clicking it.
  useEffect(() => {
    if (!priceTouched && !armed && touch != null) setPrice(touch.toFixed(2))
  }, [touch, priceTouched, armed])

  // Stops can't be IOC/FOK; keep the TIF control consistent with what will be sent.
  useEffect(() => { if (STOP_TYPES.has(type) && (tif === 'IOC' || tif === 'FOK')) setTif('DAY') }, [type, tif])

  // Any edit disarms a pending large-order confirmation.
  useEffect(() => { setArmed(false) }, [side, qtyText, type, tif, price, stop])

  const needsLimit = type === 'LMT' || type === 'STL'
  const needsStop = STOP_TYPES.has(type)
  const qty = Number(qtyText)
  const priceNum = Number(price)
  const stopNum = Number(stop)
  const last = quote?.last

  const errors = {}
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) errors.qty = `Whole number 1–${MAX_QTY}`
  if (needsLimit && !(priceNum > 0)) errors.price = 'Enter a limit price'
  if (needsStop && !(stopNum > 0)) errors.stop = 'Enter a stop trigger'
  else if (needsStop && last != null && side === 'BUY' && stopNum <= last) errors.stop = `Buy stop must be above last ${last.toFixed(2)}`
  else if (needsStop && last != null && side === 'SELL' && stopNum >= last) errors.stop = `Sell stop must be below last ${last.toFixed(2)}`
  const valid = Object.keys(errors).length === 0

  const refPx = needsLimit ? priceNum : side === 'BUY' ? quote?.ask : quote?.bid
  const notional = valid && refPx ? refPx * CONTRACT_SIZE * qty : null
  const margin = valid && quote ? quote.initial_margin * qty : null
  const large = valid && (qty >= CONFIRM_QTY || (notional ?? 0) >= CONFIRM_NOTIONAL)
  const pxLabel = type === 'MKT' ? '@ MKT' : type === 'STP' ? `STOP ${stopNum ? stopNum.toFixed(2) : '—'}`
    : type === 'STL' ? `STOP ${stopNum ? stopNum.toFixed(2) : '—'} LMT ${priceNum ? priceNum.toFixed(2) : '—'}`
      : priceNum ? `@ ${priceNum.toFixed(2)}` : ''
  const orderText = `${side} ${valid ? qty : ''} ${quote?.symbol || ''} ${pxLabel}`.replace(/\s+/g, ' ').trim()

  const show = (m) => {
    setMsg(m)
    announce?.(m.text, m.ok ? 'polite' : 'assertive')
    clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(null), 10000)
  }

  const submit = async (e) => {
    e?.preventDefault()
    if (!quote || !valid || busy) return
    if (large && !armed) { setArmed(true); return }
    setArmed(false)
    setBusy(true)
    try {
      const o = await onSubmit({
        symbol: quote.symbol, side, qty, type, tif,
        price: needsLimit ? priceNum : null,
        stop: needsStop ? stopNum : null,
      })
      const fill = o.filled ? `, filled ${o.filled} at ${o.avg_fill?.toFixed(4)}` : ''
      show({ ok: true, text: `Order ${o.id} ${o.status.toLowerCase()}: ${o.side} ${o.qty} ${o.symbol}${fill}` })
    } catch (err) {
      show({ ok: false, text: `Rejected: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  const fieldProps = (name) => ({
    id: `tt-${name}`, 'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `tt-${name}-err` : undefined,
    className: `tt-input ${errors[name] ? 'invalid' : ''}`,
  })

  return (
    <form className={`tt-ticket ${pulse ? 'tt-pulse' : ''}`} key={pulse} onSubmit={submit} aria-label={`Order ticket for ${quote?.symbol || 'contract'}`}>
      <div className="tt-side" role="radiogroup" aria-label="Side">
        <button type="button" role="radio" aria-checked={side === 'BUY'} className={`buy ${side === 'BUY' ? 'on' : ''}`} onClick={() => setSide('BUY')}>BUY</button>
        <button type="button" role="radio" aria-checked={side === 'SELL'} className={`sell ${side === 'SELL' ? 'on' : ''}`} onClick={() => setSide('SELL')}>SELL</button>
      </div>

      <div className="tt-field">
        <label htmlFor="tt-qty">Quantity (contracts)</label>
        <div className="tt-qty-line">
          <input {...fieldProps('qty')} type="number" inputMode="numeric" min={1} max={MAX_QTY} step={1}
            value={qtyText} onChange={e => setQtyText(e.target.value)} />
          <div className="tt-qty-row" role="group" aria-label="Quick quantity">
            {QTY_PRESETS.map(n => (
              <button type="button" key={n} className={qty === n ? 'on' : ''} aria-pressed={qty === n}
                aria-label={`${n} contract${n > 1 ? 's' : ''}`} onClick={() => setQtyText(String(n))}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      {errors.qty && <div id="tt-qty-err" className="tt-hint">{errors.qty}</div>}

      <div className="tt-row2">
        <div className="tt-field">
          <label htmlFor="tt-type">Order type</label>
          <select id="tt-type" className="tt-select" value={type} onChange={e => setType(e.target.value)}>
            <option value="LMT">Limit</option>
            <option value="MKT">Market</option>
            <option value="STP">Stop</option>
            <option value="STL">Stop limit</option>
          </select>
        </div>
        <div className="tt-field">
          <label htmlFor="tt-tif">Time in force</label>
          <select id="tt-tif" className="tt-select" value={tif} onChange={e => setTif(e.target.value)}>
            <option value="DAY">Day</option>
            <option value="GTC">GTC</option>
            {!needsStop && <option value="IOC">IOC</option>}
            {!needsStop && <option value="FOK">FOK</option>}
          </select>
        </div>
      </div>

      <div className="tt-row2">
        <div className="tt-field">
          <label htmlFor="tt-price">Limit price</label>
          <input {...fieldProps('price')} type="number" step="0.01" min="0.01" inputMode="decimal"
            disabled={!needsLimit} value={needsLimit ? price : ''} placeholder={needsLimit ? '' : 'Market'}
            onChange={e => { setPrice(e.target.value); setPriceTouched(true) }} />
        </div>
        <div className="tt-field">
          <label htmlFor="tt-stop">Stop trigger</label>
          <input {...fieldProps('stop')} type="number" step="0.01" min="0.01" inputMode="decimal"
            disabled={!needsStop} value={needsStop ? stop : ''} placeholder={needsStop ? (last != null ? `last ${last.toFixed(2)}` : '') : 'n/a'}
            onChange={e => setStop(e.target.value)} />
        </div>
      </div>
      {(errors.price || errors.stop) && (
        <div className="tt-hint">
          {errors.price && <span id="tt-price-err">{errors.price}. </span>}
          {errors.stop && <span id="tt-stop-err">{errors.stop}</span>}
        </div>
      )}

      <div className="tt-summary" aria-label="Order summary">
        <span>Offsets</span><span>{valid ? (qty * CONTRACT_SIZE).toLocaleString() + ' tCO₂e' : '—'}</span>
        <span>Notional</span><span>{notional ? '$' + notional.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
        <span>Initial margin</span><span>{margin ? '$' + margin.toLocaleString() : '—'}</span>
      </div>

      <button type="submit" className={`tt-submit ${armed ? 'confirm' : side.toLowerCase()}`} disabled={busy || !quote || !valid}
        aria-describedby={armed ? 'tt-confirm-note' : undefined}>
        {busy ? 'Sending…' : armed ? `CONFIRM ${orderText}` : orderText}
      </button>
      {armed && (
        <div id="tt-confirm-note" className="tt-msg" style={{ color: 'var(--tt-amber)', fontFamily: 'inherit' }} role="alert">
          Large order{notional ? ` · $${Math.round(notional).toLocaleString()}` : ''} — click again to send
        </div>
      )}
      <div className={`tt-msg ${msg ? (msg.ok ? 'tt-up' : 'tt-down') : ''}`}>{msg?.text}</div>
    </form>
  )
}
