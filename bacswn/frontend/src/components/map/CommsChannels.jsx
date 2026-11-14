import { useEffect, useState } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import MapControl from './MapControl'

/**
 * Communication links between the mesh weather stations, drawn on a map and
 * filtered by channel type from a panel on the map itself.
 */
export const CHANNELS = [
  { id: 'vhf', label: 'VHF radio', color: '#10b981', dash: null, swatch: 'solid', about: 'Short range (under ~60 nm), lowest latency' },
  { id: 'cellular', label: 'Cellular', color: '#3b82f6', dash: '8 4', swatch: 'dashed', about: 'Medium range via mobile network' },
  { id: 'satellite', label: 'Satellite', color: '#a855f7', dash: '2 5', swatch: 'dotted', about: 'Long range, highest latency' },
]
const BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c]))
const DOWN_COLOR = '#ef4444'

export const DEFAULT_COMMS_FILTER = { vhf: true, cellular: true, satellite: true, down: true }

// One comms-link filter for every map (Command Center and Mesh Network): a
// choice made on one map applies to the other, and to other open tabs.
const FILTER_KEY = 'comms-filter'
const LEGACY_KEY = 'cc-comms-filter'          // Command Center's key before the filter was shared
const FILTER_EVENT = 'bacswn:comms-filter'
let current = null                            // survives page changes even without localStorage

function readFilter() {
  if (current) return current
  try {
    const raw = localStorage.getItem(FILTER_KEY) ?? localStorage.getItem(LEGACY_KEY)
    current = { ...DEFAULT_COMMS_FILTER, ...JSON.parse(raw || '{}') }
  } catch { current = DEFAULT_COMMS_FILTER }
  return current
}

export function useCommsFilter() {
  const [filter, setFilterState] = useState(readFilter)
  useEffect(() => {
    const sync = () => setFilterState(readFilter())
    const fromOtherTab = (e) => { if (e.key === FILTER_KEY) { current = null; sync() } }
    window.addEventListener(FILTER_EVENT, sync)
    window.addEventListener('storage', fromOtherTab)
    return () => { window.removeEventListener(FILTER_EVENT, sync); window.removeEventListener('storage', fromOtherTab) }
  }, [])
  const setFilter = (next) => {
    current = next
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)) } catch { /* private mode: in-memory only */ }
    window.dispatchEvent(new Event(FILTER_EVENT))
  }
  return [filter, setFilter]
}

/** Links that pass the filter (used by the map and the text table alike). */
export function visibleLinks(links, filter) {
  return (links || []).filter(l => filter[l.type] && (l.up || filter.down))
}

export function CommsLinksLayer({ status, filter }) {
  const nodes = Object.fromEntries((status?.nodes || []).map(n => [n.station, n]))
  const links = visibleLinks(status?.links, filter).filter(l => nodes[l.a] && nodes[l.b])
  if (!links.length) return null
  const ends = new Set(links.flatMap(l => [l.a, l.b]))
  return (
    <>
      {links.map(l => {
        const c = BY_ID[l.type]
        return (
          <Polyline key={`${l.a}-${l.b}`}
            positions={[[nodes[l.a].lat, nodes[l.a].lon], [nodes[l.b].lat, nodes[l.b].lon]]}
            pathOptions={{
              color: l.up ? c.color : DOWN_COLOR, weight: l.up ? 2.5 : 2,
              opacity: l.up ? 0.85 : 0.9, dashArray: l.up ? c.dash : '4 6',
            }}>
            <Tooltip sticky>
              <b>{c.label}</b> {l.a}–{l.b} · {l.up ? 'up' : 'DOWN'}<br />
              {l.distance_nm} nm · {l.latency_ms} ms · quality {l.quality}%
            </Tooltip>
          </Polyline>
        )
      })}
      {[...ends].map(code => {
        const n = nodes[code]
        return (
          <CircleMarker key={code} center={[n.lat, n.lon]} radius={4}
            pathOptions={{ color: '#0f172a', weight: 1.5, fillColor: n.alive ? '#e2e8f0' : DOWN_COLOR, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -4]}>{code} · {n.name}{n.alive ? '' : ' · OFFLINE'}</Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

export function CommsFilterControl({ status, filter, onChange, position = 'bottomleft', defaultOpen = true }) {
  // Open on wide screens (unless the map asks otherwise); on phones start collapsed so the small map stays visible.
  const [open, setOpen] = useState(() => defaultOpen && !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches))
  const links = status?.links || []
  const count = (type) => {
    const of = links.filter(l => l.type === type)
    return { total: of.length, down: of.filter(l => !l.up).length }
  }
  const shown = CHANNELS.filter(c => filter[c.id]).length
  const set = (key, value) => onChange({ ...filter, [key]: value })
  const all = (value) => onChange({ ...filter, vhf: value, cellular: value, satellite: value })
  const shownLinks = visibleLinks(links, filter)
  const shownDown = shownLinks.filter(l => !l.up).length

  return (
    <MapControl position={position} className="comms-ctl">
      <section className="comms-panel" aria-label="Communication channels on the map">
        <button type="button" className="comms-head" aria-expanded={open} aria-controls="comms-body"
          onClick={() => setOpen(o => !o)}>
          <span aria-hidden="true">📡</span>
          <span>Comms links</span>
          <span className="comms-badge">{shown}/{CHANNELS.length}</span>
          <span aria-hidden="true" className="comms-caret">{open ? '▾' : '▸'}</span>
        </button>
        {open && (
          <div id="comms-body" className="comms-body">
            <fieldset>
              <legend className="sr-only">Channel types to show</legend>
              {CHANNELS.map(c => {
                const n = count(c.id)
                return (
                  <label key={c.id} className="comms-row" title={c.about}>
                    <input type="checkbox" checked={!!filter[c.id]} onChange={e => set(c.id, e.target.checked)} />
                    <span className={`comms-swatch ${c.swatch}`} style={{ borderColor: c.color }} aria-hidden="true" />
                    <span className="comms-name">{c.label}</span>
                    <span className="comms-count">{n.total}{n.down ? <em> · {n.down} down</em> : null}</span>
                  </label>
                )
              })}
              <label className="comms-row comms-down" title="Links that have failed or whose station is offline">
                <input type="checkbox" checked={!!filter.down} onChange={e => set('down', e.target.checked)} />
                <span className="comms-swatch dashed" style={{ borderColor: DOWN_COLOR }} aria-hidden="true" />
                <span className="comms-name">Failed links</span>
              </label>
            </fieldset>
            <div className="comms-actions">
              <button type="button" onClick={() => all(true)}>All</button>
              <button type="button" onClick={() => all(false)}>None</button>
            </div>
            <p className="comms-sum" role="status">
              {!shown ? 'No channel types selected.' : status ? `${shownLinks.length} links shown${shownDown ? `, ${shownDown} down` : ''}` : 'Loading links…'}
            </p>
          </div>
        )}
      </section>
    </MapControl>
  )
}
