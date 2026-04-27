import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CoinGeckoError, clearPriceCache, fetchPrices } from './coingecko'

describe('coingecko adapter', () => {
  beforeEach(() => {
    clearPriceCache()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('fetchPrices maps CoinGecko response to OHLCV candles', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [[1700000000000, 50_000], [1700003600000, 51_000]],
        total_volumes: [[1700000000000, 1_000_000], [1700003600000, 2_000_000]],
      }),
    } as Response)

    const result = await fetchPrices('BTC', '1D')
    expect(result.asset).toBe('BTC')
    expect(result.candles).toHaveLength(2)
    expect(result.candles[0]).toEqual({
      timestamp: 1700000000000,
      open: 50_000,
      high: 50_000,
      low: 50_000,
      close: 50_000,
      volume: 1_000_000,
    })
  })

  test('throws CoinGeckoError on non-ok response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response)
    await expect(fetchPrices('BTC', '1D')).rejects.toBeInstanceOf(CoinGeckoError)
  })

  test('caches successful responses for 60s', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [[1, 100]], total_volumes: [[1, 50]] }),
    } as Response)

    await fetchPrices('ETH', '1W')
    await fetchPrices('ETH', '1W')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('different (asset, timeframe) pairs cache independently', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [[1, 100]], total_volumes: [[1, 50]] }),
    } as Response)

    await fetchPrices('BTC', '1D')
    await fetchPrices('BTC', '1W')
    await fetchPrices('ETH', '1D')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
