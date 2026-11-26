/**
 * Tour event bus.
 *
 * What: a tiny event bus between the guided tour / stories and the pages they
 * drive, so a tour step can ask a page to do something (select a station,
 * switch a tab, start a run) without reaching into its state.
 *
 * Why: tour steps live outside the React tree of the page they control; an
 * event keeps the two decoupled (the page decides how to react).
 *
 * How: one `bacswn:tour` CustomEvent on window whose detail carries a `type`
 * plus arguments; pages subscribe to the types they handle with useTourEvent.
 */
import { useEffect, useRef } from 'react'

/** The single window event every tour request travels on. */
const EVENT = 'bacswn:tour'

/**
 * Ask whichever page is listening to act.
 * @param {string} type e.g. 'mesh-select', 'mesh-tab'
 * @param {object} [detail] arguments for the handler
 */
export function emitTour(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail } }))
}

/** Select a station on the Mesh page (shown in the precog chamber and dashboard). */
export const selectMeshStation = (station) => emitTour('mesh-select', { station })

/** Switch the Mesh page's log tabs to `tab` (e.g. 'stations', 'links', 'events'). */
export const showMeshTab = (tab) => emitTour('mesh-tab', { tab })

/**
 * Run `handler(detail)` whenever the tour emits `type`. The latest handler is
 * always used, so it need not be memoised.
 * @param {string} type
 * @param {(detail: object) => void} handler
 */
export function useTourEvent(type, handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = (e) => { if (e.detail?.type === type) ref.current(e.detail) }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [type])
}
