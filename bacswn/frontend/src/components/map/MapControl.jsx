/**
 * MapControl: put React content inside a Leaflet map as a native control.
 *
 * Why: Leaflet positions controls itself (corners, stacking, print) but knows
 * nothing about React; this bridges the two so map panels and buttons are
 * ordinary components.
 * How: a Leaflet Control creates the container element, and the children are
 * portalled into it; the control is removed on unmount or when its position or
 * class changes.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/**
 * Renders React children as a Leaflet control on the map (inside <MapContainer>).
 * Clicks, drags and wheel scrolls on it never reach the map underneath.
 * @param {{position?: 'topleft'|'topright'|'bottomleft'|'bottomright', className?: string, children: any}} props
 */
export default function MapControl({ position = 'topleft', className = '', children }) {
  const map = useMap()
  const [container, setContainer] = useState(null)

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', `leaflet-control ${className}`)
        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.disableScrollPropagation(div)
        return div
      },
    })
    const ctl = new Control({ position })
    ctl.addTo(map)
    setContainer(ctl.getContainer())
    return () => { ctl.remove() }
  }, [map, position, className])

  return container ? createPortal(children, container) : null
}
