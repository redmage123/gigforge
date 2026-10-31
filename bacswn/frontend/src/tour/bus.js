import { useEffect, useRef } from 'react'

/**
 * Tiny event bus between the guided tour and the pages it drives, so the tour
 * can ask a page to do something (select a station, switch a tab, start a run)
 * without reaching into its state.
 */
const EVENT = 'bacswn:tour'

export function emitTour(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail } }))
}

/** Run `handler(detail)` whenever the tour emits `type`. */
export function useTourEvent(type, handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = (e) => { if (e.detail?.type === type) ref.current(e.detail) }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [type])
}
