import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from './api'
import { useCmsApi } from '../api/cms/client'

export interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  cmsAvailable: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cmsAvailable = useCmsApi()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(cmsAvailable)

  const refresh = useCallback(async () => {
    if (!cmsAvailable) {
      setUser(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const u = await fetchCurrentUser()
      setUser(u)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [cmsAvailable])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (input: LoginInput) => {
    const u = await apiLogin(input)
    setUser(u)
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const created = await apiRegister(input)
    // Some Payload setups auto-log-in on first user; force fetch /me to be sure.
    try {
      await apiLogin(input)
      setUser(created)
    } catch {
      // If auto-login by Payload already set the cookie, just refresh.
      await refresh()
    }
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  const value: AuthState = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      cmsAvailable,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, cmsAvailable, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Safe defaults returned when `useAuth()` is called outside any AuthProvider.
 * This matches the runtime behavior in mock-only mode (no CMS, no auth) and
 * lets downstream components render predictably in test fixtures.
 */
const NO_PROVIDER_FALLBACK: AuthState = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  cmsAvailable: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
}

export function useAuth(): AuthState {
  return useContext(AuthContext) ?? NO_PROVIDER_FALLBACK
}
