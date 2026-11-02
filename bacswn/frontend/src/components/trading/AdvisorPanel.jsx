import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { fmtPx, fmtUsd } from './Panels'

/**
 * AI trading advisor drawer. Two parts:
 *  - Ideas: the rule-based engine's suggestions and a review of open positions,
 *    each a complete ticket the user can load (entry, or the protective stop).
 *  - Ask: a conversation with Claude (via `claude -p` on the server), grounded in
 *    the same data; its proposals arrive as the same kind of loadable ticket.
 * Nothing here submits an order — loading only fills the order ticket.
 */

const ACTION_TEXT = { cut: 'Cut', take_profit: 'Take profit', tighten: 'Tighten stop', hold: 'Hold' }
const STARTERS = [
  'What would you do with my account right now?',
  'How much of my CORSIA exposure should I hedge, and when?',
  'Which of the engine’s ideas do you disagree with?',
]

function Confidence({ value }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  return (
    <span className="ad-conf" role="meter" aria-label="Confidence" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={pct} aria-valuetext={`${pct} percent`}>
      <span className="ad-conf-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      {pct}%
    </span>
  )
}

/** One ticket: an engine idea or an AI proposal (normalised to the same shape). */
function TicketCard({ t, onLoad, onAsk }) {
  const sideWord = t.side === 'BUY' ? 'Buy' : 'Sell'
  const label = `${sideWord} ${t.qty} ${t.symbol}${t.price != null ? ` at ${fmtPx(t.price)}` : ' at market'}`
  return (
    <li className="ad-card">
      <div className="ad-card-head">
        <span className={`tt-pill ${t.side === 'BUY' ? 'buy' : 'sell'}`}>{t.side}</span>
        <b>{t.headline}</b>
        <Confidence value={t.confidence} />
      </div>
      <dl className="ad-terms">
        <div><dt>Order</dt><dd className="num">{t.qty} × {t.symbol} {t.type}{t.price != null ? ` ${fmtPx(t.price)}` : ''}</dd></div>
        {t.stop != null && <div><dt>Stop</dt><dd className="num">{fmtPx(t.stop)}</dd></div>}
        {t.target != null && <div><dt>Target</dt><dd className="num">{fmtPx(t.target)}</dd></div>}
        {t.risk != null && <div><dt>{t.riskLabel || 'Risk'}</dt><dd className="num">{fmtUsd(t.risk)}</dd></div>}
        {t.margin != null && <div><dt>Margin</dt><dd className="num">{fmtUsd(t.margin)}</dd></div>}
      </dl>
      {t.reasons?.length > 0 && <ul className="ad-why">{t.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {t.risks?.length > 0 && (
        <p className="ad-risk"><b>Risk:</b> {t.risks.map(r => /[.!?]$/.test(r.trim()) ? r.trim() : `${r.trim()}.`).join(' ')}</p>
      )}
      <div className="ad-actions">
        <button type="button" className="tt-link-btn" onClick={() => onLoad({ symbol: t.symbol, side: t.side, qty: t.qty, type: t.type, price: t.price })}
          aria-label={`Load into ticket: ${label}`}>Load into ticket</button>
        {t.stop != null && (
          <button type="button" className="tt-link-btn" onClick={() => onLoad({
            symbol: t.symbol, side: t.side === 'BUY' ? 'SELL' : 'BUY', qty: t.qty, type: 'STP', stop: t.stop,
          })} aria-label={`Load stop: ${t.side === 'BUY' ? 'sell' : 'buy'} ${t.qty} ${t.symbol} at ${fmtPx(t.stop)}`}>Load stop</button>
        )}
        {onAsk && <button type="button" className="tt-link-btn" onClick={() => onAsk(`Talk me through this idea: ${label}. Would you change anything?`)}>Ask about this</button>}
      </div>
    </li>
  )
}

/** Render the advisor's light formatting (paragraphs, "-"/"1." lists, **bold**) as
 *  React elements — no HTML injection, so model text can never become markup. */
function Bold({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
}
function RichText({ text }) {
  const blocks = []
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/)
    const num = line.match(/^\s*\d+[.)]\s+(.*)/)
    const kind = bullet ? 'ul' : num ? 'ol' : line.trim() ? 'p' : null
    const content = bullet?.[1] ?? num?.[1] ?? line.trim()
    const last = blocks[blocks.length - 1]
    if (!kind) { blocks.push({ kind: 'gap' }); continue }
    if ((kind === 'ul' || kind === 'ol') && last?.kind === kind) last.items.push(content)
    else if (kind === 'p' && last?.kind === 'p') last.items.push(content)
    else blocks.push({ kind, items: [content] })
  }
  return blocks.filter(b => b.kind !== 'gap').map((b, i) => {
    if (b.kind === 'p') return <p key={i}><Bold text={b.items.join(' ')} /></p>
    const List = b.kind
    return <List key={i}>{b.items.map((it, j) => <li key={j}><Bold text={it} /></li>)}</List>
  })
}

const fromIdea = (i) => ({
  symbol: i.symbol, side: i.side, qty: i.qty, type: i.order.type, price: i.order.price, stop: i.stop, target: i.target,
  risk: i.risk_usd, riskLabel: i.kind === 'hedge' ? 'Per 1-ATR move' : 'Risk to stop', margin: i.margin_usd,
  confidence: i.confidence, headline: i.headline, reasons: i.reasons, risks: i.risks,
})
const fromProposal = (p) => ({
  symbol: p.symbol, side: p.side, qty: p.qty, type: p.order_type, price: p.order_type === 'LMT' ? p.limit_price : null,
  stop: p.stop_loss, target: p.take_profit, confidence: p.confidence,
  headline: `${p.side === 'BUY' ? 'Buy' : 'Sell'} ${p.qty} ${p.symbol}`, reasons: [p.rationale], risks: [p.main_risk],
})

export default function AdvisorPanel({ open, onClose, onLoad, announce, returnFocusRef }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('ideas')
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState([])           // {role:'user'|'advisor'|'error', text, proposals, follow_ups, meta}
  const [asking, setAsking] = useState(false)
  const headingRef = useRef(null)
  const inputRef = useRef(null)
  const logEnd = useRef(null)

  const refresh = useCallback(() => {
    api.advisorIdeas().then(d => { setData(d); setError('') }).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    if (!open) return
    refresh()
    headingRef.current?.focus()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [open, refresh])
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }) }, [thread, asking])

  const close = () => { onClose(); requestAnimationFrame(() => returnFocusRef?.current?.focus()) }

  const ask = async (text) => {
    const q = (text ?? question).trim()
    if (!q || asking) return
    setTab('ask')
    setQuestion('')
    setThread(th => [...th, { role: 'user', text: q }])
    setAsking(true)
    announce?.('Asking the advisor. Answers usually take 20 to 40 seconds.')
    try {
      const r = await api.advisorAsk(q)
      setThread(th => [...th, { role: 'advisor', text: r.answer, proposals: r.proposals, follow_ups: r.follow_ups, dropped: r.dropped,
        meta: `${r.model || 'Claude'} · ${r.seconds}s` }])
      announce?.(`Advisor answered${r.proposals?.length ? ` with ${r.proposals.length} trade proposal${r.proposals.length > 1 ? 's' : ''}` : ''}.`)
    } catch (e) {
      setThread(th => [...th, { role: 'error', text: e.message }])
      announce?.(e.message, 'assertive')
    } finally {
      setAsking(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }
  const startOver = async () => {
    await api.advisorReset().catch(() => {})
    setThread([])
    announce?.('Conversation cleared.')
    inputRef.current?.focus()
  }

  if (!open) return null
  const ai = data?.ai
  const tabs = [['ideas', `Ideas${data ? ` (${data.ideas.length})` : ''}`], ['ask', 'Ask the advisor']]

  return (
    <aside className="ad-drawer" aria-labelledby="ad-h" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
      <div className="ad-head">
        <h2 id="ad-h" tabIndex={-1} ref={headingRef}>AI trading advisor</h2>
        <button type="button" className="tt-icon-btn" onClick={close} aria-label="Close advisor">✕</button>
      </div>
      <div className="tt-tabs ad-tabs" role="tablist" aria-label="Advisor views"
        onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const next = tab === 'ideas' ? 'ask' : 'ideas'
          setTab(next)
          requestAnimationFrame(() => document.getElementById(`ad-tab-${next}`)?.focus())
        }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`ad-tab-${id}`} aria-selected={tab === id} aria-controls="ad-panel"
            tabIndex={tab === id ? 0 : -1} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="ad-body" id="ad-panel" role="tabpanel" aria-labelledby={`ad-tab-${tab}`} tabIndex={0}>
        {error && <p className="ad-error" role="alert">{error}</p>}

        {tab === 'ideas' && (!data ? <p className="tt-dim">Reading the market…</p> : (
          <>
            {data.portfolio.warning && <p className="ad-warn">{data.portfolio.warning}</p>}
            <h3 className="ad-sub">Suggested trades</h3>
            {data.ideas.length === 0
              ? <p className="tt-dim">No signal is strong enough for a trade right now.</p>
              : <ul className="ad-cards">{data.ideas.map(i => <TicketCard key={i.id} t={fromIdea(i)} onLoad={onLoad} onAsk={ask} />)}</ul>}

            <h3 className="ad-sub">Your positions</h3>
            {data.review.length === 0 ? <p className="tt-dim">No open positions.</p> : (
              <table className="tt-table ad-review">
                <caption className="tt-sr-only">Review of open positions</caption>
                <thead><tr><th scope="col">Contract</th><th scope="col">Net</th><th scope="col">P&amp;L</th><th scope="col">Advice</th></tr></thead>
                <tbody>{data.review.map(r => (
                  <tr key={r.symbol}>
                    <th scope="row">{r.symbol}</th>
                    <td className="num">{r.qty > 0 ? '+' : ''}{r.qty}</td>
                    <td className="num">{fmtUsd(r.unrealized_pnl, true)}<br /><span className="tt-dim">{r.pnl_atr > 0 ? '+' : ''}{r.pnl_atr} ATR</span></td>
                    <td><b>{ACTION_TEXT[r.action]}</b> — {r.why}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <details className="ad-method">
              <summary>How these ideas are made</summary>
              <p>{data.method}</p>
            </details>
          </>
        ))}

        {tab === 'ask' && (
          <>
            {ai && !ai.available && <p className="ad-warn">{ai.reason}</p>}
            <div className="ad-thread" role="log" aria-label="Conversation with the advisor" aria-live="polite">
              {thread.length === 0 && (
                <div className="ad-starters">
                  <p className="tt-dim">Ask about the market, your positions or your CORSIA hedge. The advisor sees live prices,
                    your account and the ideas above. It can propose trades; you always place them yourself.</p>
                  <ul>{STARTERS.map(s => (
                    <li key={s}><button type="button" className="tt-link-btn" onClick={() => ask(s)}>{s}</button></li>
                  ))}</ul>
                </div>
              )}
              {thread.map((m, i) => (
                <div key={i} className={`ad-msg ${m.role}`}>
                  <span className="ad-who">{m.role === 'user' ? 'You' : m.role === 'error' ? 'Advisor unavailable' : 'Advisor'}</span>
                  <div className="ad-text"><RichText text={m.text} /></div>
                  {m.proposals?.length > 0 && (
                    <ul className="ad-cards" aria-label="Proposed trades">
                      {m.proposals.map((p, j) => <TicketCard key={j} t={fromProposal(p)} onLoad={onLoad} />)}
                    </ul>
                  )}
                  {m.dropped?.length > 0 && <p className="tt-dim ad-small">Not shown (failed checks): {m.dropped.join('; ')}</p>}
                  {m.follow_ups?.length > 0 && (
                    <div className="ad-follow">{m.follow_ups.map(f => (
                      <button key={f} type="button" className="tt-link-btn" onClick={() => ask(f)} disabled={asking}>{f}</button>
                    ))}</div>
                  )}
                  {m.meta && <span className="tt-dim ad-small">{m.meta}</span>}
                </div>
              ))}
              {asking && <p className="tt-dim" role="status">Advisor is thinking… usually 20–40 seconds.</p>}
              <span ref={logEnd} />
            </div>
            <form className="ad-ask" onSubmit={e => { e.preventDefault(); ask() }}>
              <label htmlFor="ad-q" className="tt-sr-only">Your question</label>
              <textarea id="ad-q" ref={inputRef} rows={2} maxLength={2000} value={question} placeholder="Ask the advisor…"
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} />
              <div className="ad-ask-row">
                <button type="submit" className="tt-submit buy" disabled={asking || !question.trim()}>Ask</button>
                {thread.length > 0 && <button type="button" className="tt-link-btn" onClick={startOver} disabled={asking}>Start over</button>}
                <span className="tt-dim ad-small">Enter to send · Shift+Enter for a new line</span>
              </div>
            </form>
          </>
        )}
        <p className="ad-disclaimer">{data?.disclaimer || 'Simulated market — not financial advice. You review and submit every order.'}</p>
      </div>
    </aside>
  )
}
