import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  addToWatchlist,
  createAlertConfig,
  deleteAlertConfig,
  listAlertConfigs,
  listWatchlist,
  removeFromWatchlist,
} from './userState'
import { CmsAuthError } from './client'

describe('userState — Watchlist CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('listWatchlist sends no userId filter (server scopes by req.user)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], totalDocs: 0 }),
    } as Response)

    await listWatchlist()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/watchlist\?limit=200$/)
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
  })

  test('addToWatchlist POSTs symbol+name only (userId set server-side)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'wl-1',
        userId: 'srv-derived',
        symbol: 'BTC',
        name: 'Bitcoin',
        addedAt: '2026-04-28T00:00:00Z',
      }),
    } as Response)

    const entry = await addToWatchlist('BTC', 'Bitcoin')
    expect(entry.symbol).toBe('BTC')
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({ symbol: 'BTC', name: 'Bitcoin' })
    expect(body).not.toHaveProperty('userId')
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

  test('listWatchlist throws CmsAuthError on 401', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    } as Response)

    await expect(listWatchlist()).rejects.toBeInstanceOf(CmsAuthError)
  })
})

describe('userState — AlertConfigs CRUD', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('listAlertConfigs sends no userId filter', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [], totalDocs: 0 }),
    } as Response)
    await listAlertConfigs()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/alertConfigs\?limit=200$/)
  })

  test('createAlertConfig defaults status=active and omits userId', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a-1',
        userId: 'srv-derived',
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
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      asset: 'BTC',
      condition: 'above',
      threshold: 60_000,
      status: 'active',
    })
    expect(body).not.toHaveProperty('userId')
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
