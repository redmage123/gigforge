import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * State kept in the page URL's query string, so a copied link reopens the same
 * view. `parse` turns the stored string back into a value (and may reject it by
 * returning undefined, which falls back to the default).
 */
export function useUrlState(key, fallback, parse = (s) => s) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const parsed = raw == null ? undefined : parse(raw)
  const value = parsed === undefined ? fallback : parsed
  const set = useCallback((next) => {
    setParams(p => {
      const q = new URLSearchParams(p)
      if (next == null || next === '' || next === fallback) q.delete(key)
      else q.set(key, String(next))
      return q
    }, { replace: true, preventScrollReset: true })
  }, [key, fallback, setParams])
  return [value, set]
}

/** Parser for whole numbers from an allowed list. */
export const oneOf = (allowed) => (s) => {
  const n = Number(s)
  return allowed.includes(n) ? n : undefined
}
