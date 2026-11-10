import { useEffect, useSyncExternalStore } from 'react'

/**
 * Demo pause: one switch, shared with the server and every other viewer, that
 * freezes the demo so a presenter can stop and explain. While paused:
 *  - usePolling stops refreshing and useWebSocket ignores incoming messages,
 *    so no page changes, raises alerts, chimes or announces anything;
 *  - usePrefersReducedMotion reports true, so decorative animation holds still;
 *  - the server stops its simulations (mesh, market, agents, broadcasts).
 * The state lives in a tiny module store so any hook can read it without a
 * provider; Layout keeps it in sync with the server.
 */

let state = { paused: false, by: null, since: null }
const listeners = new Set()

function set(next) {
  const merged = { paused: !!next.paused, by: next.by ?? null, since: next.since ?? null }
  if (merged.paused === state.paused && merged.by === state.by && merged.since === state.since) return
  state = merged
  listeners.forEach(l => l())
}

export const isDemoPaused = () => state.paused

export function subscribeDemoPause(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDemoPause() {
  return useSyncExternalStore(subscribeDemoPause, () => state)
}

export function useDemoPaused() {
  return useSyncExternalStore(subscribeDemoPause, () => state.paused)
}

function authHeaders() {
  const token = localStorage.getItem('token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

/** Pause or resume for everyone. The screen freezes at once, before the server replies. */
export async function setDemoPaused(paused) {
  const previous = state
  set({ ...state, paused })
  try {
    const r = await fetch('/api/demo/pause', {
      method: 'POST', headers: authHeaders(), credentials: 'include', body: JSON.stringify({ paused }),
    })
    if (!r.ok) throw new Error(`Pause request failed: ${r.status}`)
    set(await r.json())
  } catch (e) {
    set(previous)
    throw e
  }
}

/** Keep this screen in step with the shared pause (e.g. paused from another laptop). */
export function useDemoPauseSync(enabled = true, intervalMs = 3000) {
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const poll = async () => {
      try {
        const r = await fetch('/api/demo/pause', { headers: authHeaders(), credentials: 'include' })
        if (r.ok && !stop) set(await r.json())
      } catch { /* offline: keep the current state */ }
    }
    poll()
    const t = setInterval(poll, intervalMs)
    return () => { stop = true; clearInterval(t) }
  }, [enabled, intervalMs])
}

/** setTimeout-style wait that does not count time spent paused (for scripted demo sequences). */
export function demoSleep(ms) {
  return new Promise(resolve => {
    let left = ms
    let last = Date.now()
    const tick = () => {
      const now = Date.now()
      if (!state.paused) left -= now - last
      last = now
      if (left <= 0) resolve()
      else setTimeout(tick, Math.min(left, 200))
    }
    setTimeout(tick, Math.min(left, 200))
  })
}
