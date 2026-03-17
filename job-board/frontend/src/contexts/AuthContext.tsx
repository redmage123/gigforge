import { createContext, useContext, useState, ReactNode } from 'react'
import type { Role, User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function parseToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!))
    return payload as User
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('token')
    return stored ? parseToken(stored) : null
  })

  function login(newToken: string) {
    setToken(newToken)
    setUser(parseToken(newToken))
    localStorage.setItem('token', newToken)
  }

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export type { Role }
