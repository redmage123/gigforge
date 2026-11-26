/**
 * usePolling: periodic data fetching for live dashboards.
 *
 * What: calls a fetch function now and then every `intervalMs`, exposing the
 * latest data, a loading flag, the last error message and a manual refresh.
 *
 * Why: most pages show live data that must refresh on a timer but also freeze
 * when the presenter pauses the demo; this keeps that logic in one place.
 *
 * How: one effect loads on mount (and when the fetch function changes), a second
 * runs the interval only while not paused, and a third catches up on resume.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDemoPaused } from './useDemoPause'

/**
 * Fetch now, then every intervalMs. While the demo is paused the scheduled
 * refreshes stop (the first load and explicit refresh() calls still run, so a
 * page opened during a pause shows its data); on resume it refreshes at once.
 * Errors are kept as `error` (the message) and the previous data is left in place.
 * @param {() => Promise<any>} fetchFn memoise it (useCallback) or it reloads every render
 * @param {number} [intervalMs]
 * @returns {{data: any, loading: boolean, error: string|null, refresh: () => Promise<void>}}
 */
export function usePolling(fetchFn, intervalMs = 30000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const paused = useDemoPaused()

  /** Fetch once now; keeps the previous data on error. */
  const refresh = useCallback(async () => {
    try {
      const result = await fetchFn()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fetchFn])

  // First load (and reload when the fetch function changes), paused or not.
  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (paused) return
    const interval = setInterval(refresh, intervalMs)
    return () => clearInterval(interval)
  }, [refresh, intervalMs, paused])

  // Catch up as soon as the demo resumes.
  const wasPaused = useRef(paused)
  useEffect(() => {
    if (wasPaused.current && !paused) refresh()
    wasPaused.current = paused
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refresh }
}
