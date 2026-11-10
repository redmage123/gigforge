import { useState, useEffect, useCallback, useRef } from 'react'
import { useDemoPaused } from './useDemoPause'

/**
 * Fetch now, then every intervalMs. While the demo is paused the scheduled
 * refreshes stop (the first load and explicit refresh() calls still run, so a
 * page opened during a pause shows its data); on resume it refreshes at once.
 */
export function usePolling(fetchFn, intervalMs = 30000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const paused = useDemoPaused()

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
