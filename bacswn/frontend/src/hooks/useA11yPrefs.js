import { useCallback, useEffect, useState } from 'react'

/**
 * User accessibility preferences, persisted per browser and shared live between
 * components (and tabs) via a custom event + the storage event.
 *
 *   alertSound  — play a chime when a new operational alert arrives
 *   alertFlash  — pulse the alert banner once when it arrives (never > 3 flashes/s)
 *   speechRate  — speaking rate for spoken briefings
 */
const KEY = 'skywatch-a11y'
const DEFAULTS = { alertSound: true, alertFlash: true, speechRate: 0.9 }
const EVENT = 'skywatch-a11y-change'

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

export function useA11yPrefs() {
  const [prefs, setPrefs] = useState(read)

  useEffect(() => {
    const sync = () => setPrefs(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const setPref = useCallback((key, value) => {
    const next = { ...read(), [key]: value }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: session only */ }
    setPrefs(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [prefs, setPref]
}

/** True when the user has asked the OS/browser to minimise motion. */
export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}
