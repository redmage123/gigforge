import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client'

const ACTION_LABELS = {
  add_trade: 'Log trade', create_alert: 'Price alert', add_watchlist: 'Watchlist', remove_watchlist: 'Watchlist',
  set_inplay_rules: 'In-Play settings',
}
const STATUS_TEXT = { done: 'Done', cancelled: 'Cancelled', failed: 'Failed', expired: 'Expired', invalid: "Can't do this" }

// One proposed action: nothing happens until the user confirms
function ActionCard({ action, onDecide }) {
  const [busy, setBusy] = useState(false)
  const decide = async (verb) => {
    setBusy(true)
    try { await onDecide(action.id, verb) } finally { setBusy(false) }
  }
  const pending = action.status === 'proposed'
  return (
    <div className="chat-action" data-status={action.status} role="group" aria-label={`Proposed action: ${action.summary}`}>
      <div className="chat-action-kind">{ACTION_LABELS[action.type] || 'Action'}</div>
      <div className="chat-action-summary">{action.summary}</div>
      {pending ? (
        <div className="chat-action-buttons">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => decide('confirm')}>{busy ? 'Working…' : 'Confirm'}</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => decide('cancel')}>Cancel</button>
        </div>
      ) : (
        <div className={`chat-action-status ${action.status === 'done' ? 'positive' : action.status === 'cancelled' ? 'muted' : 'negative'}`}>
          {STATUS_TEXT[action.status] || action.status}{action.result ? ` · ${action.result}` : action.error && action.status !== 'invalid' ? ` · ${action.error}` : ''}
        </div>
      )}
    </div>
  )
}

function ChatWindow() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  // The conversation lives on the server, so it survives page changes and devices
  useEffect(() => {
    if (!isOpen || loaded) return
    api.get('/api/assistant/history')
      .then((r) => { setMessages(r.messages || []); setLoaded(true) })
      .catch((e) => setError(e.message))
  }, [isOpen, loaded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, isOpen])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isTyping) return
    setMessages((prev) => [...prev, { role: 'user', content: text, pending: true }])
    setInput('')
    setIsTyping(true)
    setError('')
    try {
      const data = await api.post('/api/assistant/message', { message: text })
      setMessages((prev) => [...prev.map((m) => (m.pending ? { ...m, pending: false } : m)), data.message])
    } catch (err) {
      setMessages((prev) => [
        ...prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
        { role: 'assistant', content: `Sorry, the assistant is unavailable right now (${err.message}).`, local: true },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const decide = async (actionId, verb) => {
    try {
      const r = await api.post(`/api/assistant/actions/${actionId}/${verb}`, {})
      setMessages((prev) => prev.map((m) => (m.actions ? { ...m, actions: m.actions.map((a) => (a.id === actionId ? r.action : a)) } : m)))
      if (verb === 'confirm' && r.action?.status === 'done') {
        // Let open pages (portfolio, alerts, watchlist) pick up the change
        window.dispatchEvent(new CustomEvent('assetadvisor:data-changed', { detail: r.action }))
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const clearChat = async () => {
    try {
      await api.del('/api/assistant/history')
      setMessages([])
    } catch (err) {
      setError(err.message)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {isOpen && (
        <div className="chat-window" role="dialog" aria-label="AI Assistant">
          <div className="chat-header">
            <h4>AI Assistant</h4>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {messages.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={clearChat} title="Start a new conversation">Clear</button>}
              <button className="chat-close-btn" onClick={() => setIsOpen(false)} aria-label="Close chat">&times;</button>
            </div>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ color: 'var(--muted)', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
                Ask about markets, your portfolio, or the app. I can also do things for you once you confirm, like:
                <div style={{ marginTop: 8 }}>“Log a buy of 10 AAPL at market”<br />“Alert me if gold goes above 4,300”<br />“Add EUR/USD to my watchlist”<br />“Scan hourly US stocks”</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`} style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
                {(msg.actions || []).map((a) => <ActionCard key={a.id} action={a} onDecide={decide} />)}
              </div>
            ))}
            {isTyping && <div className="chat-typing">Thinking...</div>}
            {error && <div className="negative" style={{ fontSize: '0.8rem' }}>{error}</div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              aria-label="Message the assistant"
              placeholder="Ask, or tell me what to do…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button onClick={sendMessage} disabled={isTyping || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
      <button className="chat-toggle-btn" onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close chat' : 'Open AI assistant'}>
        {isOpen ? '✕' : '\u{1F4AC}'}
      </button>
    </>
  )
}

export default ChatWindow
