/**
 * CRUD wrappers for user-state collections (Watchlist, AlertConfigs).
 *
 * Sprint 5 ships these unauthenticated, scoped to a hardcoded `demo-user`.
 * Sprint 7 will replace `DEMO_USER_ID` with the real authenticated user.
 */
import { CMS_BASE_URL, useCmsApi } from './client'

export const DEMO_USER_ID = 'demo-user'

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
  if (!useCmsApi()) throw new Error('CMS not configured')
  const res = await fetch(`${CMS_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`CMS ${res.status}: ${path}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

// ---------- Watchlist ----------

export async function listWatchlist(userId = DEMO_USER_ID): Promise<WatchlistEntry[]> {
  const where = encodeURIComponent(JSON.stringify({ userId: { equals: userId } }))
  const result = await jsonRequest<PayloadList<WatchlistEntry>>(
    `/api/watchlist?where=${where}&limit=200`,
  )
  return result.docs
}

export async function addToWatchlist(
  symbol: string,
  name: string,
  userId = DEMO_USER_ID,
): Promise<WatchlistEntry> {
  return jsonRequest<WatchlistEntry>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ userId, symbol, name }),
  })
}

export async function removeFromWatchlist(id: string): Promise<void> {
  await jsonRequest<void>(`/api/watchlist/${id}`, { method: 'DELETE' })
}

// ---------- Alert configs ----------

export async function listAlertConfigs(userId = DEMO_USER_ID): Promise<AlertConfigEntry[]> {
  const where = encodeURIComponent(JSON.stringify({ userId: { equals: userId } }))
  const result = await jsonRequest<PayloadList<AlertConfigEntry>>(
    `/api/alertConfigs?where=${where}&limit=200`,
  )
  return result.docs
}

export interface CreateAlertInput {
  asset: string
  condition: 'above' | 'below'
  threshold: number
}

export async function createAlertConfig(
  input: CreateAlertInput,
  userId = DEMO_USER_ID,
): Promise<AlertConfigEntry> {
  return jsonRequest<AlertConfigEntry>('/api/alertConfigs', {
    method: 'POST',
    body: JSON.stringify({ ...input, userId, status: 'active' }),
  })
}

export async function deleteAlertConfig(id: string): Promise<void> {
  await jsonRequest<void>(`/api/alertConfigs/${id}`, { method: 'DELETE' })
}
