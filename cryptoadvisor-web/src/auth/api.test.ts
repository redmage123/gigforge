import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AuthError, fetchCurrentUser, login, logout, register } from './api'

describe('auth/api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('login POSTs credentials and returns user', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
    } as Response)

    const user = await login({ email: 'a@b.c', password: 'secret123' })
    expect(user).toEqual({ id: 'u-1', email: 'a@b.c' })
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(url).toMatch(/\/api\/users\/login$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  test('login throws AuthError on bad credentials', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    } as Response)
    await expect(login({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(AuthError)
  })

  test('register POSTs to /api/users', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ doc: { id: 'u-2', email: 'new@x.io' } }),
    } as Response)

    const user = await register({ email: 'new@x.io', password: 'secret123' })
    expect(user).toEqual({ id: 'u-2', email: 'new@x.io' })
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/users$/)
  })

  test('logout POSTs to /api/users/logout', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    await logout()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect(url).toMatch(/\/api\/users\/logout$/)
    expect(init.method).toBe('POST')
  })

  test('fetchCurrentUser returns null on 401 instead of throwing', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response)
    const u = await fetchCurrentUser()
    expect(u).toBeNull()
  })

  test('fetchCurrentUser returns user on success', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u-3', email: 'me@me.io' } }),
    } as Response)
    const u = await fetchCurrentUser()
    expect(u).toEqual({ id: 'u-3', email: 'me@me.io' })
  })
})
