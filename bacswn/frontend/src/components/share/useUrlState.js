/**
 * URL-backed view state for shareable links.
 *
 * What: useUrlState (a useState-like hook stored in the query string) and
 * oneOf (a parser that accepts only listed numbers).
 * Why: filters such as a chart's period must survive "Copy link" and reload.
 * How: react-router's search params, replaced (not pushed) on each change so
 * the back button is not flooded; default values are left out of the URL.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * State kept in the page URL's query string, so a copied link reopens the same
 * view. `parse` turns the stored string back into a value (and may reject it by
 * returning undefined, which falls back to the default).
 * @param {string} key query parameter name
 * @param {any} fallback value when the parameter is absent or rejected
 * @param {(raw: string) => any} [parse]
 * @returns {[any, (next: any) => void]}
 */
export function useUrlState(key, fallback, parse = (s) => s) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const parsed = raw == null ? undefined : parse(raw)
  const value = parsed === undefined ? fallback : parsed
  /** Store `next` in the URL (removed when empty or equal to the fallback), without a new history entry. */
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

/**
 * Parser for whole numbers from an allowed list.
 * @param {number[]} allowed
 * @returns {(s: string) => number|undefined}
 */
export const oneOf = (allowed) => (s) => {
  const n = Number(s)
  return allowed.includes(n) ? n : undefined
}
