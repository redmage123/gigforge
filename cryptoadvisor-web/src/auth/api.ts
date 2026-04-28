/**
 * Auth HTTP wrappers for Payload's built-in `users` auth collection.
 *
 * All requests use `credentials: 'include'` so the session cookie set by
 * Payload's login endpoint is sent on subsequent requests.
 */
import { CMS_BASE_URL, useCmsApi } from '../api/cms/client'

export interface AuthUser {
  id: string
  email: string
  createdAt?: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!useCmsApi()) throw new AuthError(0, 'CMS not configured')
  const res = await fetch(`${CMS_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let msg = `Auth ${res.status}`
    try {
      const body = (await res.json()) as { message?: string; errors?: { message?: string }[] }
      msg = body.errors?.[0]?.message ?? body.message ?? msg
    } catch {
      // ignore parse failure
    }
    throw new AuthError(res.status, msg)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export interface LoginResponse {
  user: AuthUser
  exp?: number
  token?: string
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const result = await authRequest<LoginResponse>('/api/users/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.user
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  // Payload create returns the doc; for first user this also auto-logs in
  // when "first user" auto-login is enabled; otherwise the caller logs in.
  const result = await authRequest<{ doc: AuthUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.doc
}

export async function logout(): Promise<void> {
  await authRequest<void>('/api/users/logout', { method: 'POST' })
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await authRequest<{ user: AuthUser | null }>('/api/users/me')
    return result.user
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) return null
    throw err
  }
}
