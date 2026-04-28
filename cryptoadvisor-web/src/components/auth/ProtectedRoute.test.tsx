import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '../../auth/AuthContext'
import ProtectedRoute from './ProtectedRoute'

function harness(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-screen">LOGIN</div>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <div data-testid="secret-screen">SECRET</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders children when authenticated', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
    } as Response)

    harness('/secret')
    await waitFor(() => expect(screen.getByTestId('secret-screen')).toBeInTheDocument())
  })

  test('redirects to /login?returnTo=... when unauthenticated', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response)

    harness('/secret?x=1')
    await waitFor(() => expect(screen.getByTestId('login-screen')).toBeInTheDocument())
  })
})
