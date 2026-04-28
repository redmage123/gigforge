/**
 * Client for the cryptoadvisor-ai backend (Sprint 13).
 *
 * The base URL is read from VITE_AI_URL at build time; defaults to
 * http://localhost:4103 (dev). Streaming chat uses fetch + a manual
 * ReadableStream reader (browsers do not expose EventSource over POST).
 */

const AI_BASE: string =
  (typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_AI_URL as string | undefined)
    : undefined) ?? 'http://localhost:4103'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  symbol?: string
  use_rag?: boolean
}

export interface ExplainSignalRequest {
  symbol: string
  action: string
  conviction: number
  contributors: Array<{
    source: string
    vote: number
    weight: number
    detail: string
  }>
  rawPolarity?: number
}

export interface ExplainSignalResponse {
  explanation: string
  kg_context: string
  rag_sources: Array<{ title: string; source: string; score: number }>
}

export async function explainSignal(
  body: ExplainSignalRequest,
): Promise<ExplainSignalResponse> {
  const res = await fetch(`${AI_BASE}/signals/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`signals/explain ${res.status}`)
  return (await res.json()) as ExplainSignalResponse
}

export async function aiHealth(): Promise<{ status: string; gemma_reachable: boolean }> {
  const res = await fetch(`${AI_BASE}/healthz`)
  if (!res.ok) throw new Error(`healthz ${res.status}`)
  return res.json()
}

export async function ragSearch(
  query: string,
  top_k = 5,
): Promise<{
  results: Array<{ doc_id: number; source: string; title: string; chunk: string; score: number }>
}> {
  const res = await fetch(`${AI_BASE}/rag/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k }),
  })
  if (!res.ok) throw new Error(`rag/search ${res.status}`)
  return res.json()
}

/**
 * Stream a chat response. Caller passes an `onDelta` callback that fires for
 * every token chunk; resolves when [DONE] is received or stream closes.
 */
export async function chatStream(
  req: ChatRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${AI_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok) throw new Error(`chat/stream ${res.status}`)
  if (!res.body) throw new Error('chat/stream: no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const obj = JSON.parse(payload) as { delta?: string; error?: string }
        if (obj.error) throw new Error(obj.error)
        if (obj.delta) onDelta(obj.delta)
      } catch {
        // ignore malformed lines
      }
    }
  }
}

export async function submitFeedback(body: {
  user_message: string
  assistant_message: string
  rating: number
  rewrite?: string
}): Promise<void> {
  await fetch(`${AI_BASE}/chat/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
