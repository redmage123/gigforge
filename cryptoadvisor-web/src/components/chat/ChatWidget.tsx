/**
 * Floating chat widget (Sprint 13, STORY-1309).
 *
 * Always-on bottom-right launcher. Click to open a panel with streaming
 * chat against the cryptoadvisor-ai backend (Gemma + KG + RAG).
 * Conversation history is persisted in localStorage.
 *
 * Context awareness: when the user is on /options, /onchain, /sentiment,
 * etc, the widget can auto-detect the asset/scope and pass it as the
 * `symbol` for KG enrichment.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { chatStream, submitFeedback, type ChatMessage } from '../../api/aiClient'

const STORAGE_KEY = 'cryptoadvisor.chat.history'

interface StoredMessage extends ChatMessage {
  id: string
  ts: number
  rated?: 1 | -1 | 0
}

function loadHistory(): StoredMessage[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as StoredMessage[]
  } catch {
    return []
  }
}

function saveHistory(msgs: StoredMessage[]): void {
  if (typeof localStorage === 'undefined') return
  // Cap at last 100 messages
  localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-100)))
}

function detectSymbol(pathname: string, search: string): string | undefined {
  const params = new URLSearchParams(search)
  const explicit = params.get('symbol')
  if (explicit) return explicit
  if (pathname.startsWith('/options')) return 'BTC'
  if (pathname.startsWith('/onchain')) return 'BTC'
  if (pathname.startsWith('/sentiment')) return 'BTC'
  if (pathname.startsWith('/orderbook')) return 'BTC'
  return undefined
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const symbol = useMemo(() => detectSymbol(location.pathname, location.search), [location])

  useEffect(() => setMessages(loadHistory()), [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  async function send() {
    if (!input.trim() || streaming) return
    setError(null)
    const userMsg: StoredMessage = {
      id: `m-${Date.now()}-u`,
      ts: Date.now(),
      role: 'user',
      content: input.trim(),
    }
    const placeholder: StoredMessage = {
      id: `m-${Date.now()}-a`,
      ts: Date.now(),
      role: 'assistant',
      content: '',
    }
    const next = [...messages, userMsg, placeholder]
    setMessages(next)
    saveHistory(next)
    setInput('')
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      let acc = ''
      await chatStream(
        {
          messages: next
            .filter((m) => m.id !== placeholder.id)
            .map(({ role, content }) => ({ role, content })),
          symbol,
          use_rag: true,
        },
        (delta) => {
          acc += delta
          setMessages((cur) => {
            const updated = cur.map((m) =>
              m.id === placeholder.id ? { ...m, content: acc } : m,
            )
            saveHistory(updated)
            return updated
          })
        },
        ctrl.signal,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setMessages((cur) => {
        const updated = cur.map((m) =>
          m.id === placeholder.id ? { ...m, content: `[error: ${msg}]` } : m,
        )
        saveHistory(updated)
        return updated
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function clearHistory() {
    if (!confirm('Clear chat history?')) return
    setMessages([])
    saveHistory([])
  }

  function rate(msg: StoredMessage, rating: 1 | -1) {
    const userMsg = messages[messages.findIndex((m) => m.id === msg.id) - 1]
    if (!userMsg) return
    setMessages((cur) => {
      const updated = cur.map((m) => (m.id === msg.id ? { ...m, rated: rating } : m))
      saveHistory(updated)
      return updated
    })
    submitFeedback({
      user_message: userMsg.content,
      assistant_message: msg.content,
      rating,
    }).catch(() => {})
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI chat"
        className="fixed bottom-4 right-4 z-50 bg-accent text-white rounded-full w-14 h-14 shadow-lg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-center text-2xl"
      >
        💬
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-bg-surface border border-bg-border rounded-lg shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <span className="text-text-primary font-semibold">AI Assistant</span>
          {symbol ? (
            <span className="text-xs text-accent bg-accent/20 px-2 py-0.5 rounded">{symbol}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearHistory}
            className="text-xs text-text-muted hover:text-text-primary"
            aria-label="Clear chat history"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="text-text-muted hover:text-text-primary text-lg"
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-text-muted text-sm">
            Ask me about indicators, signals, sentiment, or any asset.
            <br />
            <em>e.g. &ldquo;Why is RSI useful for BTC right now?&rdquo;</em>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}
            >
              <div
                className={`inline-block max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-bg-elevated text-text-primary'
                }`}
              >
                {m.content || (streaming ? <span className="opacity-50">…</span> : '')}
              </div>
              {m.role === 'assistant' && m.content && !streaming && (
                <div className="mt-1 flex gap-2 text-xs text-text-muted justify-start">
                  <button
                    type="button"
                    onClick={() => rate(m, 1)}
                    className={`hover:text-emerald-400 ${m.rated === 1 ? 'text-emerald-400' : ''}`}
                    aria-label="Rate response positively"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    onClick={() => rate(m, -1)}
                    className={`hover:text-rose-400 ${m.rated === -1 ? 'text-rose-400' : ''}`}
                    aria-label="Rate response negatively"
                  >
                    👎
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {error && <div role="alert" className="text-xs text-rose-400">{error}</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="p-3 border-t border-bg-border flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? 'Streaming…' : 'Ask anything…'}
          disabled={streaming}
          aria-label="Chat input"
          className="flex-1 bg-bg-elevated border border-bg-border rounded px-3 py-2 text-sm text-text-primary disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="bg-accent text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          Send
        </button>
      </form>
    </div>
  )
}
