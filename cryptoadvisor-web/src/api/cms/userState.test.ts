import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  addToWatchlist,
  createAlertConfig,
  deleteAlertConfig,
  listAlertConfigs,
  listWatchlist,
  removeFromWatchlist,
  DEMO_USER_ID,
} from './userState'

describe('userState — Watchlist CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('listWatchlist scopes by demo userId', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], totalDocs: 0 }),
    } as Response)

    await listWatchlist()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/watchlist\?where=/)
    expect(decodeURIComponent(url)).toContain(`"userId":{"equals":"${DEMO_USER_ID}"}`)
  })

  test('addToWatchlist POSTs JSON', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'wl-1',
        userId: DEMO_USER_ID,
        symbol: 'BTC',
        name: 'Bitcoin',
        addedAt: '2026-04-28T00:00:00Z',
      }),
    } as Response)

    const entry = await addToWatchlist('BTC', 'Bitcoin')
    expect(entry.symbol).toBe('BTC')
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({
      symbol: 'BTC',
      name: 'Bitcoin',
      userId: DEMO_USER_ID,
    })
  })

  test('removeFromWatchlist DELETEs by id', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    await removeFromWatchlist('wl-1')
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(url).toMatch(/\/api\/watchlist\/wl-1$/)
    expect(init.method).toBe('DELETE')
  })
})

describe('userState — AlertConfigs CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('listAlertConfigs scopes by demo userId', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], totalDocs: 0 }),
    } as Response)
    await listAlertConfigs()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/alertConfigs\?where=/)
  })

  test('createAlertConfig defaults status=active', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a-1',
        userId: DEMO_USER_ID,
        asset: 'BTC',
        condition: 'above',
        threshold: 60_000,
        status: 'active',
        createdAt: '2026-04-28T00:00:00Z',
      }),
    } as Response)

    const entry = await createAlertConfig({ asset: 'BTC', condition: 'above', threshold: 60_000 })
    expect(entry.status).toBe('active')
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({
      asset: 'BTC',
      condition: 'above',
      threshold: 60_000,
      status: 'active',
      userId: DEMO_USER_ID,
    })
  })

  test('deleteAlertConfig DELETEs by id', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
    await deleteAlertConfig('a-1')
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(init.method).toBe('DELETE')
  })
})
