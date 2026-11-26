/**
 * Demo pause: one switch, shared with the server and every other viewer, that
 * freezes the demo so a presenter can stop and explain.
 *
 * What it does while paused:
 *  - usePolling stops refreshing and useWebSocket ignores incoming messages,
 *    so no page changes, raises alerts, chimes or announces anything;
 *  - usePrefersReducedMotion reports true, so decorative animation holds still;
 *  - the server stops its simulations (mesh, market, agents, broadcasts).
 *
 * Why a module store: any hook or plain function can read the state without a
 * React provider (useWebSocket's message handler, demoSleep's timer).
 *
 * How: `state` lives in this module; subscribers are notified on change and
 * React reads it with useSyncExternalStore. Layout keeps it in step with the
 * server through useDemoPauseSync; setDemoPaused changes it for everyone.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { authHeaders } from '../api/client'
import { ApiError } from '../api/errors'

const PAUSE_URL = '/api/demo/pause'

let state = { paused: false, by: null, since: null }
const listeners = new Set()

/** Replace the shared state (normalised) and notify subscribers if anything changed. */
function set(next) {
  const merged = { paused: !!next.paused, by: next.by ?? null, since: next.since ?? null }
  if (merged.paused === state.paused && merged.by === state.by && merged.since === state.since) return
  state = merged
  listeners.forEach(l => l())
}

/** Whether the demo is paused right now (non-React callers). */
export const isDemoPaused = () => state.paused

/**
 * Be told whenever the pause state changes.
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeDemoPause(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The full pause state `{ paused, by, since }`; re-renders on change. */
export function useDemoPause() {
  return useSyncExternalStore(subscribeDemoPause, () => state)
}

/** Just the paused flag; re-renders only when it flips. */
export function useDemoPaused() {
  return useSyncExternalStore(subscribeDemoPause, () => state.paused)
}

/**
 * Pause or resume for everyone. The screen freezes at once, before the server
 * replies; if the request fails the previous state is restored.
 * @param {boolean} paused
 * @throws {ApiError} if the server refuses (network failures propagate as-is)
 */
export async function setDemoPaused(paused) {
  const previous = state
  set({ ...state, paused })
  try {
    const r = await fetch(PAUSE_URL, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), credentials: 'include', body: JSON.stringify({ paused }),
    })
    if (!r.ok) throw new ApiError(`Pause request failed: ${r.status}`, r.status)
    set(await r.json())
  } catch (e) {
    set(previous)
    throw e
  }
}

/**
 * Keep this screen in step with the shared pause (e.g. paused from another laptop).
 * Uses plain fetch rather than the api client so a poll never triggers the
 * session-expiry redirect.
 * @param {boolean} [enabled]
 * @param {number} [intervalMs]
 */
export function useDemoPauseSync(enabled = true, intervalMs = 3000) {
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const poll = async () => {
      try {
        const r = await fetch(PAUSE_URL, { headers: authHeaders({ 'Content-Type': 'application/json' }), credentials: 'include' })
        if (r.ok && !stop) set(await r.json())
      } catch { /* offline: keep the current state */ }
    }
    poll()
    const t = setInterval(poll, intervalMs)
    return () => { stop = true; clearInterval(t) }
  }, [enabled, intervalMs])
}

/**
 * setTimeout-style wait that does not count time spent paused (for scripted demo sequences).
 * @param {number} ms
 * @returns {Promise<void>}
 */
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
