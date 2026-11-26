/**
 * ResetViewControl: a "Reset map" button shared by every Leaflet map.
 *
 * Why: users who pan or zoom away (or hit grey tiles after a resize) need one
 * reliable way back to the starting view, including keyboard users.
 * How: remembers the first view, then fits / flies back to it, without
 * animation when the user prefers reduced motion.
 */
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { usePrefersReducedMotion } from '../../hooks/useA11yPrefs'
import MapControl from './MapControl'

/**
 * "Reset map" button for any react-leaflet map. Puts the map back the way it
 * opened: the original view (explicit `bounds`, or `center` + `zoom`, or else
 * whatever the map showed when it first loaded), popups closed, and the map
 * re-measured so grey or missing tiles after a resize are redrawn.
 *
 * Use inside <MapContainer>. Clicks on it never reach the map, so maps where a
 * click does something (e.g. spawn a storm) are not triggered by it.
 * @param {{center?: [number, number], zoom?: number, bounds?: any, position?: string}} props
 */
export default function ResetViewControl({ center, zoom, bounds, position = 'topleft' }) {
  const map = useMap()
  const reducedMotion = usePrefersReducedMotion()
  const home = useRef(null)

  // Remember the starting view once, as the map first showed it.
  useEffect(() => {
    if (!home.current) {
      home.current = bounds ? { bounds } : { center: center || map.getCenter(), zoom: zoom ?? map.getZoom() }
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Close popups, re-measure the map and return to the remembered view. */
  const reset = () => {
    const h = home.current
    if (!h) return
    map.closePopup()
    map.invalidateSize()
    const opts = { animate: !reducedMotion, duration: 0.6 }
    if (h.bounds) map.fitBounds(h.bounds, opts)
    else if (reducedMotion) map.setView(h.center, h.zoom, { animate: false })
    else map.flyTo(h.center, h.zoom, opts)
  }

  return (
    <MapControl position={position} className="leaflet-bar map-reset-ctl">
      <button type="button" className="map-reset-btn" onClick={reset}
        title="Reset map: back to the starting view of the Bahamas, popups closed, map redrawn">
        <span aria-hidden="true">⟲</span> Reset map
      </button>
    </MapControl>
  )
}
