/**
 * Accessibility preference hooks.
 *
 * What: useA11yPrefs (the user's alert-sound, alert-flash and speech-rate
 * choices) and usePrefersReducedMotion (whether animation should hold still).
 *
 * Why: the chime, the visual pulse and read-aloud must each be switchable by the
 * user (WCAG 1.4.2, 2.3.1, 2.2.2), and every component that animates must
 * respect the OS "reduce motion" setting; one source keeps them consistent.
 *
 * How: preferences are stored in localStorage and broadcast with a custom window
 * event (same tab) plus the `storage` event (other tabs), so every mounted
 * component updates at once.
 */
import { useDemoPaused } from './useDemoPause'
import { useCallback, useEffect, useState } from 'react'

/*
 * Stored preferences:
 *   alertSound  — play a chime when a new operational alert arrives
 *   alertFlash  — pulse the alert banner once when it arrives (never > 3 flashes/s)
 *   speechRate  — speaking rate for spoken briefings
 */
const KEY = 'skywatch-a11y'
/** Values used until the user changes them. */
const DEFAULTS = { alertSound: true, alertFlash: true, speechRate: 0.9 }
/** Same-tab change notification (the storage event only fires in other tabs). */
const EVENT = 'skywatch-a11y-change'

/** Stored preferences over the defaults; defaults alone if storage is unavailable or corrupt. */
function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

/**
 * The user's accessibility preferences, kept in sync across components and tabs.
 * @returns {[{alertSound: boolean, alertFlash: boolean, speechRate: number}, (key: string, value: any) => void]}
 *   the preferences and a setter for one of them
 */
export function useA11yPrefs() {
  const [prefs, setPrefs] = useState(read)

  useEffect(() => {
    const sync = () => setPrefs(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  /** Change one preference, persist it and notify every subscriber. */
  const setPref = useCallback((key, value) => {
    const next = { ...read(), [key]: value }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: session only */ }
    setPrefs(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [prefs, setPref]
}

/**
 * True when the user has asked the OS/browser to minimise motion, or while the
 * demo is paused (a paused demo holds decorative animation still too).
 */
export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const paused = useDemoPaused()   // a paused demo holds decorative animation still too
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced || paused
}
