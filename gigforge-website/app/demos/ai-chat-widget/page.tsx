'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  thinking?: boolean
}

interface Doc {
  id: string
  title: string
  content: string
  chunks: number
}

const DOCS: Doc[] = [
  {
    id: 'refund',
    title: 'Refund Policy',
    chunks: 4,
    content: 'We offer a 30-day money-back guarantee on all plans. Refunds are processed within 5 business days. Overage charges are non-refundable. Annual plans receive a pro-rated refund.',
  },
  {
    id: 'api',
    title: 'API Reference',
    chunks: 12,
    content: 'Authentication uses Bearer tokens. Rate limits: Free 60 req/min, Pro 600 req/min, Enterprise unlimited. Endpoints: GET /v1/items, POST /v1/items, PATCH /v1/items/:id, DELETE /v1/items/:id.',
  },
  {
    id: 'onboarding',
    title: 'Getting Started Guide',
    chunks: 8,
    content: 'Install the SDK: npm install @acme/sdk. Set your API key: ACME_API_KEY=your_key. Call acme.init(). Free accounts get 1,000 requests/month. Upgrade to Pro for 50,000 requests/month.',
  },
]

const FAQ: Record<string, { answer: string; sources: string[] }> = {
  refund: { answer: "We offer a **30-day money-back guarantee** on all plans. Refunds are processed within 5 business days. Note: overage charges are non-refundable, and annual plans receive a pro-rated refund.", sources: ['Refund Policy'] },
  rate: { answer: "Rate limits depend on your plan:\n- **Free**: 60 req/min\n- **Pro**: 600 req/min\n- **Enterprise**: Unlimited\n\nIf you hit your limit you'll receive a `429 Too Many Requests` response.", sources: ['API Reference'] },
  install: { answer: "Getting started is quick:\n1. `npm install @acme/sdk`\n2. Set `ACME_API_KEY=your_key` in your environment\n3. Call `acme.init()` in your app\n\nFree accounts include 1,000 requests/month — upgrade to Pro for 50,000.", sources: ['Getting Started Guide'] },
  pro: { answer: "The **Pro plan** includes:\n- 50,000 requests/month\n- 600 req/min rate limit\n- Up to 5 team seats\n- $49/month\n\nOverage is billed at $0.001 per request.", sources: ['Getting Started Guide', 'API Reference'] },
}

function matchFaq(q: string): { answer: string; sources: string[] } | null {
  const l = q.toLowerCase()
  if (l.includes('refund') || l.includes('money back') || l.includes('cancel')) return FAQ.refund
  if (l.includes('rate') || l.includes('limit') || l.includes('429') || l.includes('throttl')) return FAQ.rate
  if (l.includes('install') || l.includes('start') || l.includes('setup') || l.includes('sdk') || l.includes('begin')) return FAQ.install
  if (l.includes('pro') || l.includes('plan') || l.includes('upgrade') || l.includes('price') || l.includes('cost')) return FAQ.pro
  return null
}

const SUGGESTIONS = ['How do I get a refund?', 'What are the rate limits?', 'How do I install the SDK?', 'What does Pro include?']

export default function AiChatDemo() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m powered by RAG — ask me anything about the docs in the knowledge base.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [retrievalLog, setRetrievalLog] = useState<{ query: string; docs: string[]; score: number[] }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setMessages((prev) => [...prev, { role: 'assistant', content: '', thinking: true }])
    setLoading(true)

    // Simulate vector search
    await new Promise((r) => setTimeout(r, 600))
    const match = matchFaq(q)
    const retrievedDocs = match?.sources ?? ['Refund Policy', 'API Reference'].slice(0, 1)
    const scores = retrievedDocs.map(() => parseFloat((0.72 + Math.random() * 0.25).toFixed(3)))
    setRetrievalLog((prev) => [{ query: q, docs: retrievedDocs, score: scores }, ...prev].slice(0, 5))

    // Simulate LLM generation
    await new Promise((r) => setTimeout(r, 800))
    const answer = match?.answer ?? "I couldn't find an exact match in the knowledge base. Try asking about refunds, rate limits, getting started, or plan pricing."
    const sources = match?.sources ?? []

    setMessages((prev) => [
      ...prev.slice(0, -1),
      { role: 'assistant', content: answer, sources },
    ])
    setLoading(false)
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/demos" className="text-accent hover:underline mb-6 inline-block text-sm">
        ← All Demos
      </Link>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">🤖</span>
        <h1 className="text-3xl font-bold text-text-primary">AI Chat Widget (RAG)</h1>
      </div>
      <p className="text-text-secondary mb-10">Ask questions over the knowledge base. Watch the vector retrieval happen before the answer is generated.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Knowledge Base */}
        <div className="space-y-4">
          <div className="bg-bg-secondary rounded-xl p-5">
            <h2 className="text-base font-semibold text-text-primary mb-3">Knowledge Base</h2>
            <div className="space-y-2">
              {DOCS.map((doc) => (
                <div key={doc.id} className="bg-bg-primary rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">{doc.title}</span>
                    <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded font-mono">{doc.chunks} chunks</span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed line-clamp-2">{doc.content}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3">3 documents · pgvector cosine similarity · 768-dim embeddings</p>
          </div>

          {/* Retrieval Log */}
          <div className="bg-bg-secondary rounded-xl p-5">
            <h2 className="text-base font-semibold text-text-primary mb-3">Vector Retrieval</h2>
            {retrievalLog.length === 0 ? (
              <p className="text-text-muted text-sm">Ask a question to see retrieval scores.</p>
            ) : (
              <div className="space-y-3">
                {retrievalLog.map((r, i) => (
                  <div key={i} className="bg-bg-primary rounded-lg p-3 font-mono text-xs space-y-1">
                    <div className="text-text-secondary">query: &quot;{r.query.slice(0, 30)}{r.query.length > 30 ? '…' : ''}&quot;</div>
                    {r.docs.map((doc, j) => (
                      <div key={doc} className="flex justify-between">
                        <span className="text-emerald-400">{doc}</span>
                        <span className="text-text-muted">{r.score[j]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-2 flex flex-col bg-bg-secondary rounded-xl overflow-hidden" style={{ minHeight: '520px' }}>
          <div className="p-4 border-b border-bg-tertiary flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">AI</div>
            <div>
              <div className="text-sm font-semibold text-text-primary">Acme Support</div>
              <div className="text-xs text-emerald-400">● Online — powered by pgvector RAG</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: '380px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-bg-primary text-text-primary'}`}>
                  {msg.thinking ? (
                    <div className="flex items-center gap-2 text-text-muted">
                      <span className="animate-pulse">Searching knowledge base</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1">
                          {msg.sources.map((s) => (
                            <span key={s} className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-blue-200">📄 {s}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  disabled={loading}
                  className="text-xs bg-bg-primary hover:bg-bg-tertiary text-text-secondary px-3 py-1.5 rounded-full transition-colors border border-bg-tertiary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="p-4 border-t border-bg-tertiary flex gap-2">
            <input
              className="flex-1 bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="bg-accent hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">37</div><div className="text-xs text-text-secondary">Tests, 0 failures</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">~5KB</div><div className="text-xs text-text-secondary">Vanilla JS widget</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">Mock</div><div className="text-xs text-text-secondary">Runs without API keys</div></div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/portfolio/ai-chat-widget" className="text-accent hover:underline text-sm mr-6">View case study →</Link>
        <Link href="/contact" className="inline-block bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">Build something similar</Link>
      </div>
    </div>
  )
}
