/**
 * Communication links between the mesh weather stations, drawn on a map and
 * filtered by channel type from a panel on the map itself.
 *
 * What: the channel catalogue (CHANNELS / CHANNEL_BY_ID), a text description of
 * a link's state (linkState), the shared link filter (useCommsFilter,
 * visibleLinks), the map layer (CommsLinksLayer) and its filter panel
 * (CommsFilterControl).
 *
 * Why: the Command Center and Mesh Network maps show the same links; one module
 * keeps their colours, wording and filter identical, and the filter chosen on
 * one map applies to the other.
 *
 * How: the filter lives in a module variable mirrored to localStorage and
 * broadcast with a window event (same tab) and the storage event (other tabs).
 */
import { useEffect, useState } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import MapControl from './MapControl'

/**
 * Link channel types: label, map colour and dash pattern, legend swatch, a
 * description, and `short` (the compact name used in tables and buttons).
 */
export const CHANNELS = [
  { id: 'wired', label: 'Wired line', short: 'Wired', color: '#f472b6', dash: '12 4 2 4', swatch: 'dashdot', about: 'Fibre or copper line to the BACSWN hub, at the main airport sites' },
  { id: 'vhf', label: 'VHF radio', short: 'VHF', color: '#10b981', dash: null, swatch: 'solid', about: 'Short range (under ~60 nm), lowest latency' },
  { id: 'cellular', label: 'Cellular', short: 'Cellular', color: '#3b82f6', dash: '8 4', swatch: 'dashed', about: 'Medium range via mobile network' },
  { id: 'satellite', label: 'Satellite', short: 'Satellite', color: '#a855f7', dash: '2 5', swatch: 'dotted', about: 'Long range, highest latency' },
]
const BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c]))
/** Colour for failed links and offline stations. */
const DOWN_COLOR = '#ef4444'

/** Everything shown, including failed links. */
export const DEFAULT_COMMS_FILTER = { wired: true, vhf: true, cellular: true, satellite: true, down: true }
/** CHANNELS keyed by id. */
export const CHANNEL_BY_ID = BY_ID

/**
 * One line describing a link's channel state, for tooltips and tables.
 * @param {object} l a link from the mesh status (`cut`, `up`, `on_backup`, `channels`…)
 * @returns {string} e.g. 'Up', 'Cut', 'On backup: Satellite (VHF radio lost: mast down)'
 */
export function linkState(l) {
  const name = (id) => BY_ID[id]?.label || id
  if (l.cut) return 'Cut'
  if (!l.up) {
    const why = (l.channels || []).map(c => c.why).find(Boolean)
    return `Down: no working channel${why ? ` (${why})` : ''}`
  }
  if (l.on_backup) {
    const lost = (l.channels || []).find(c => c.type === l.preferred)
    const back = l.switch_back ? `; ${name(l.switch_back.channel)} is back, switching in ${l.switch_back.minutes_left} min` : ''
    return `On backup: ${name(l.active)}${lost?.why ? ` (${name(l.preferred)} lost: ${lost.why})` : ''}${back}`
  }
  return 'Up'
}

// One comms-link filter for every map (Command Center and Mesh Network): a
// choice made on one map applies to the other, and to other open tabs.
const FILTER_KEY = 'comms-filter'
const LEGACY_KEY = 'cc-comms-filter'          // Command Center's key before the filter was shared
const FILTER_EVENT = 'bacswn:comms-filter'
let current = null                            // survives page changes even without localStorage

/** The current filter: in memory, else stored (new key, then the legacy one), else the default. */
function readFilter() {
  if (current) return current
  try {
    const raw = localStorage.getItem(FILTER_KEY) ?? localStorage.getItem(LEGACY_KEY)
    current = { ...DEFAULT_COMMS_FILTER, ...JSON.parse(raw || '{}') }
  } catch { current = DEFAULT_COMMS_FILTER }
  return current
}

/**
 * The comms-link filter shared by every map and open tab.
 * @returns {[object, (next: object) => void]} channel id (plus `down`) -> shown?, and its setter
 */
export function useCommsFilter() {
  const [filter, setFilterState] = useState(readFilter)
  useEffect(() => {
    const sync = () => setFilterState(readFilter())
    const fromOtherTab = (e) => { if (e.key === FILTER_KEY) { current = null; sync() } }
    window.addEventListener(FILTER_EVENT, sync)
    window.addEventListener('storage', fromOtherTab)
    return () => { window.removeEventListener(FILTER_EVENT, sync); window.removeEventListener('storage', fromOtherTab) }
  }, [])
  /** Store the new filter and tell every subscriber (this tab via event; others via storage). */
  const setFilter = (next) => {
    current = next
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)) } catch { /* private mode: in-memory only */ }
    window.dispatchEvent(new Event(FILTER_EVENT))
  }
  return [filter, setFilter]
}

/**
 * Links that pass the filter (used by the map and the text table alike).
 * @param {object[]} [links]
 * @param {object} filter from useCommsFilter
 * @returns {object[]}
 */
export function visibleLinks(links, filter) {
  return (links || []).filter(l => filter[l.type] && (l.up || filter.down))
}

/**
 * Map layer: one line per visible link (channel colour and dash; red when down)
 * and a dot at each linked station, with tooltips giving the details.
 * @param {{status: object, filter: object}} props `status`: mesh status with `nodes` and `links`
 */
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
              <b>{c.label}</b> {l.a}–{l.b} · {linkState(l)}<br />
              {l.distance_nm} nm · {l.latency_ms} ms · channels: {(l.channels || []).map(x => BY_ID[x.type]?.label).join(', ')}
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

/**
 * Collapsible on-map panel for choosing which channel types (and failed links)
 * to show, with per-type link counts and a live summary of what is shown.
 * @param {{status: object, filter: object, onChange: (next: object) => void,
 *   position?: string, defaultOpen?: boolean}} props
 */
export function CommsFilterControl({ status, filter, onChange, position = 'bottomleft', defaultOpen = true }) {
  // Open on wide screens (unless the map asks otherwise); on phones start collapsed so the small map stays visible.
  const [open, setOpen] = useState(() => defaultOpen && !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches))
  const links = status?.links || []
  /** Links of one channel type: total and how many are down. */
  const count = (type) => {
    const of = links.filter(l => l.type === type)
    return { total: of.length, down: of.filter(l => !l.up).length }
  }
  const shown = CHANNELS.filter(c => filter[c.id]).length
  /** Show or hide one channel type (or `down`). */
  const set = (key, value) => onChange({ ...filter, [key]: value })
  /** Show or hide every channel type at once (leaves `down` as it is). */
  const all = (value) => onChange({ ...filter, wired: value, vhf: value, cellular: value, satellite: value })
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
                    <span className={`comms-swatch ${c.swatch}`} style={{ borderColor: c.color, color: c.color }} aria-hidden="true" />
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
