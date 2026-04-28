/**
 * Modular user-defined feed configuration (Sprint 12, STORY-1113).
 *
 * Lets users register their own market-data feeds without touching code.
 * Configs are persisted in localStorage and loaded at startup. The shape
 * is exchange-agnostic — anything that emits L2 orderbook events into a
 * `subscribe(symbol, onUpdate)` adapter can be plugged in via the
 * `kind: 'custom'` adapter slot.
 *
 * Built-in adapters: binance, bybit, okx, coinbase, deribit (read-only,
 * no API key). Built-ins are always available — user configs *augment*
 * them, they don't replace.
 *
 * For 'custom' kind: the user supplies a WebSocket URL and a small
 * mapping spec describing where the bids/asks/sequence-id live in the
 * incoming JSON. The adapter walks the spec to extract levels at
 * runtime. See `feedAdapterRegistry.ts` for the runtime that consumes
 * these configs.
 */

export type BuiltInExchange = 'binance' | 'bybit' | 'okx' | 'coinbase' | 'deribit'

export interface BuiltInFeedConfig {
  id: string
  kind: BuiltInExchange
  enabled: boolean
}

export interface CustomFeedConfig {
  id: string
  kind: 'custom'
  enabled: boolean
  label: string
  /** WebSocket URL. */
  url: string
  /** Subscribe message sent on open. `{symbol}` is interpolated. */
  subscribeMessage?: string
  /** JSONPath-ish spec: dot-notation path into the message JSON. */
  paths: {
    /** Path to the array of bid [price, size] tuples. */
    bids: string
    /** Path to the array of ask [price, size] tuples. */
    asks: string
    /** Optional path to the update sequence id. */
    sequenceId?: string
    /** Optional path to a 'snapshot' vs 'delta' discriminator. */
    type?: string
    /** Value of the `type` field that means "snapshot". Default 'snapshot'. */
    snapshotValue?: string
  }
  /** Default timeframe (1D/1W/1M); for OHLCV feeds (future). */
  timeframe?: string
}

export type FeedConfig = BuiltInFeedConfig | CustomFeedConfig

const STORAGE_KEY = 'cryptoadvisor.userFeeds'

const DEFAULT_BUILT_INS: BuiltInFeedConfig[] = [
  { id: 'binance-default', kind: 'binance', enabled: true },
  { id: 'bybit-default', kind: 'bybit', enabled: true },
  { id: 'okx-default', kind: 'okx', enabled: true },
  { id: 'coinbase-default', kind: 'coinbase', enabled: true },
  { id: 'deribit-default', kind: 'deribit', enabled: true },
]

export function loadFeedConfigs(): FeedConfig[] {
  if (typeof localStorage === 'undefined') return DEFAULT_BUILT_INS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_BUILT_INS
    const parsed = JSON.parse(raw) as FeedConfig[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BUILT_INS
  } catch {
    return DEFAULT_BUILT_INS
  }
}

export function saveFeedConfigs(configs: FeedConfig[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

export function addFeed(config: FeedConfig): FeedConfig[] {
  const next = [...loadFeedConfigs(), config]
  saveFeedConfigs(next)
  return next
}

export function removeFeed(id: string): FeedConfig[] {
  const next = loadFeedConfigs().filter((c) => c.id !== id)
  saveFeedConfigs(next)
  return next
}

export function toggleFeed(id: string, enabled: boolean): FeedConfig[] {
  const next = loadFeedConfigs().map((c) => (c.id === id ? { ...c, enabled } : c))
  saveFeedConfigs(next)
  return next
}

export function resetToDefaults(): FeedConfig[] {
  saveFeedConfigs(DEFAULT_BUILT_INS)
  return DEFAULT_BUILT_INS
}

/** Walk a dot-notation path through a JSON object. */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined
  let cur: any = obj
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[key]
  }
  return cur
}
