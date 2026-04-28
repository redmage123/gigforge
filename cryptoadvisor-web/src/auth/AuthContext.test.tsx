import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

function Probe() {
  const { user, isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <span data-testid="state">loading</span>
  return (
    <span data-testid="state">
      {isAuthenticated ? `auth:${user!.email}` : 'anon'}
    </span>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('initial /me success populates user', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
    } as Response)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('auth:a@b.c'))
  })

  test('initial /me 401 leaves user null', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anon'))
  })

  test('logout clears user on success', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)

    function LogoutBtn() {
      const { logout, user } = useAuth()
      return (
        <>
          <span data-testid="who">{user?.email ?? 'none'}</span>
          <button type="button" onClick={() => void logout()}>Logout</button>
        </>
      )
    }

    render(
      <AuthProvider>
        <LogoutBtn />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('a@b.c'))

    await act(async () => {
      screen.getByText('Logout').click()
    })
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'))
  })
})
