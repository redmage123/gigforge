/**
 * CRUD wrappers for user-state collections (Watchlist, AlertConfigs).
 *
 * Sprint 7 update: removed the hardcoded `DEMO_USER_ID` payload — the CMS
 * now sets `userId` from `req.user` server-side and filters all reads to the
 * authenticated user. Requests use credentials: 'include' so the session
 * cookie set by `users/login` is sent.
 *
 * Throws `CmsAuthError` (subclass of CmsError) on 401 so the caller can
 * redirect to /login. The CMS client's smart wrapper does the actual
 * categorization in `client.ts`.
 */
import { CMS_BASE_URL, CmsAuthError, CmsError, useCmsApi } from './client'

export interface WatchlistEntry {
  id: string
  userId: string
  symbol: string
  name?: string
  addedAt: string
}

export interface AlertConfigEntry {
  id: string
  userId: string
  asset: string
  condition: 'above' | 'below'
  threshold: number
  status: 'active' | 'triggered' | 'expired'
  createdAt: string
}

interface PayloadList<T> {
  docs: T[]
  totalDocs: number
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!useCmsApi()) throw new CmsError(0, null, 'CMS not configured')
  const res = await fetch(`${CMS_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // ignore parse failure
    }
    if (res.status === 401) {
      throw new CmsAuthError(`CMS 401: ${path}`)
    }
    throw new CmsError(res.status, body, `CMS ${res.status}: ${path}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

// ---------- Watchlist ----------

export async function listWatchlist(): Promise<WatchlistEntry[]> {
  // No `where=` filter: server-side access control already restricts to
  // the authenticated user's docs.
  const result = await jsonRequest<PayloadList<WatchlistEntry>>(
    `/api/watchlist?limit=200`,
  )
  return result.docs
}

export async function addToWatchlist(
  symbol: string,
  name: string,
): Promise<WatchlistEntry> {
  return jsonRequest<WatchlistEntry>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ symbol, name }),
  })
}

export async function removeFromWatchlist(id: string): Promise<void> {
  await jsonRequest<void>(`/api/watchlist/${id}`, { method: 'DELETE' })
}

// ---------- Alert configs ----------

export async function listAlertConfigs(): Promise<AlertConfigEntry[]> {
  const result = await jsonRequest<PayloadList<AlertConfigEntry>>(
    `/api/alertConfigs?limit=200`,
  )
  return result.docs
}

export interface CreateAlertInput {
  asset: string
  condition: 'above' | 'below'
  threshold: number
}

export async function createAlertConfig(input: CreateAlertInput): Promise<AlertConfigEntry> {
  return jsonRequest<AlertConfigEntry>('/api/alertConfigs', {
    method: 'POST',
    body: JSON.stringify({ ...input, status: 'active' }),
  })
}

export async function deleteAlertConfig(id: string): Promise<void> {
  await jsonRequest<void>(`/api/alertConfigs/${id}`, { method: 'DELETE' })
}
