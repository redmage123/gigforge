/**
 * Deribit public REST + WebSocket client (Sprint 11, STORY-1108).
 *
 * Deribit is the dominant venue for BTC/ETH options (~95% of volume). Their
 * public REST endpoints and WebSocket channels require no API key for
 * read-only market data: instrument list, book summary (best bid/ask,
 * mark/IV/greeks per contract), and order books.
 *
 * Docs: https://docs.deribit.com/#public-api-methods
 */

const REST_BASE = 'https://www.deribit.com/api/v2'
const WS_URL = 'wss://www.deribit.com/ws/api/v2'

export type DeribitCurrency = 'BTC' | 'ETH'

export interface DeribitInstrument {
  instrument_name: string
  kind: 'option'
  option_type: 'call' | 'put'
  strike: number
  expiration_timestamp: number
  base_currency: string
  quote_currency: string
  contract_size: number
}

export interface DeribitBookSummary {
  instrument_name: string
  underlying_price: number
  mark_price: number
  mark_iv: number
  bid_price: number | null
  ask_price: number | null
  open_interest: number
  volume: number
  delta: number
  gamma: number
  theta: number
  vega: number
}

interface DeribitResponse<T> {
  jsonrpc: string
  id?: number
  result?: T
  error?: { code: number; message: string }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${REST_BASE}${path}?${qs}`)
  if (!res.ok) throw new Error(`deribit ${path} ${res.status}`)
  const json = (await res.json()) as DeribitResponse<T>
  if (json.error) throw new Error(`deribit error: ${json.error.message}`)
  if (!json.result) throw new Error('deribit: empty result')
  return json.result
}

/** All currently-listed option instruments for a given currency. */
export async function getInstruments(currency: DeribitCurrency): Promise<DeribitInstrument[]> {
  return get<DeribitInstrument[]>('/public/get_instruments', {
    currency,
    kind: 'option',
    expired: 'false',
  })
}

/** Per-instrument book summary including mark price + IV + greeks. */
export async function getBookSummary(currency: DeribitCurrency): Promise<DeribitBookSummary[]> {
  return get<DeribitBookSummary[]>('/public/get_book_summary_by_currency', {
    currency,
    kind: 'option',
  })
}

/**
 * Build a {expiry → strikes → call/put} option chain by joining the
 * instrument list with the book summary. Used by the Options page to
 * render the chain table and the IV smile.
 */
export interface OptionChainRow {
  strike: number
  call: DeribitBookSummary | null
  put: DeribitBookSummary | null
}

export interface OptionChain {
  expiry: number
  expiryLabel: string
  underlyingPrice: number
  rows: OptionChainRow[]
}

export async function buildOptionChain(currency: DeribitCurrency): Promise<OptionChain[]> {
  const [instruments, summaries] = await Promise.all([
    getInstruments(currency),
    getBookSummary(currency),
  ])
  const summaryByName = new Map(summaries.map((s) => [s.instrument_name, s]))
  const byExpiry = new Map<number, Map<number, OptionChainRow>>()
  let underlying = 0

  for (const inst of instruments) {
    const summary = summaryByName.get(inst.instrument_name) ?? null
    if (summary && summary.underlying_price) underlying = summary.underlying_price
    const expiryMap = byExpiry.get(inst.expiration_timestamp) ?? new Map<number, OptionChainRow>()
    const row = expiryMap.get(inst.strike) ?? { strike: inst.strike, call: null, put: null }
    if (inst.option_type === 'call') row.call = summary
    else row.put = summary
    expiryMap.set(inst.strike, row)
    byExpiry.set(inst.expiration_timestamp, expiryMap)
  }

  return Array.from(byExpiry.entries())
    .sort(([a], [b]) => a - b)
    .map(([expiry, strikeMap]) => ({
      expiry,
      expiryLabel: new Date(expiry).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      underlyingPrice: underlying,
      rows: Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike),
    }))
}

/**
 * Open a Deribit WebSocket connection and subscribe to ticker updates for
 * the given instrument names. Returns a disposer that closes the socket.
 */
export interface DeribitTickerEvent {
  instrument: string
  markPrice: number
  markIv: number
  delta: number
  gamma: number
  vega: number
  theta: number
  underlying: number
}

export function subscribeTicker(
  instruments: string[],
  onMessage: (e: DeribitTickerEvent) => void,
): () => void {
  if (typeof WebSocket === 'undefined') return () => {}
  const ws = new WebSocket(WS_URL)
  ws.onopen = () => {
    const channels = instruments.map((i) => `ticker.${i}.100ms`)
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'public/subscribe',
        params: { channels },
      }),
    )
  }
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      const d = data?.params?.data
      if (!d?.instrument_name) return
      onMessage({
        instrument: d.instrument_name,
        markPrice: d.mark_price ?? 0,
        markIv: d.mark_iv ?? 0,
        delta: d.greeks?.delta ?? 0,
        gamma: d.greeks?.gamma ?? 0,
        vega: d.greeks?.vega ?? 0,
        theta: d.greeks?.theta ?? 0,
        underlying: d.underlying_price ?? 0,
      })
    } catch {
      /* ignore malformed messages */
    }
  }
  return () => ws.close()
}
