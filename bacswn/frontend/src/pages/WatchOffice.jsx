import { useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ─── Flight category colors ────────────────────────────────────────────
const CAT_COLORS = { VFR: '#10b981', MVFR: '#3b82f6', IFR: '#ef4444', LIFR: '#a855f7' }
const CAT_CRITERIA = {
  VFR: '> 3SM, > 3000ft ceiling',
  MVFR: '1–3SM or 1000–3000ft',
  IFR: '½–1SM or 500–1000ft',
  LIFR: '< ½SM or < 500ft',
}

// ─── Station map marker (shows ICAO, temp, wind, vis at a glance) ──────
const stationMarkerIcon = (s) => {
  const color = CAT_COLORS[s.flight_category] || '#64748b'
  const windDir = s.wind_dir_deg != null ? s.wind_dir_deg : null
  const windArrowStyle = windDir != null
    ? `display:inline-block;transform:rotate(${windDir}deg);font-size:13px;line-height:1`
    : ''
  const windArrow = windDir != null
    ? `<span style="${windArrowStyle}">↑</span> ${s.wind_speed_kt ?? '–'}kt`
    : `${s.wind_speed_kt != null ? s.wind_speed_kt + 'kt' : '–'}`

  return L.divIcon({
    className: '',
    html: `<div style="
      background:rgba(15,23,42,0.90);
      border:2px solid ${color};
      border-radius:7px;
      padding:4px 8px;
      min-width:82px;
      cursor:pointer;
      box-shadow:0 3px 14px rgba(0,0,0,0.7),0 0 0 1px ${color}22;
      backdrop-filter:blur(6px);
      transition:box-shadow 0.15s;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:12px;font-weight:800;color:${color};letter-spacing:0.5px">${s.icao || s.station_id || '?'}</span>
        <span style="font-size:9px;font-weight:700;color:${color};border:1px solid ${color};border-radius:3px;padding:0 3px;line-height:1.5">${s.flight_category || '?'}</span>
      </div>
      <div style="font-size:10px;color:#94a3b8;display:flex;gap:5px;align-items:center">
        <span style="color:#e2e8f0">${s.temp_c != null ? s.temp_c + '°C' : '–'}</span>
        <span>${windArrow}</span>
        <span>${s.visibility_sm != null ? s.visibility_sm + 'SM' : '–'}</span>
      </div>
    </div>`,
    iconSize: [94, 40],
    iconAnchor: [47, 20],
  })
}

// Stale/no-data station marker
const staleMarkerIcon = (icao) => L.divIcon({
  className: '',
  html: `<div style="
    background:rgba(15,23,42,0.75);border:2px solid #374151;border-radius:7px;
    padding:4px 8px;min-width:60px;cursor:pointer;
  ">
    <div style="font-size:12px;font-weight:700;color:#6b7280">${icao}</div>
    <div style="font-size:9px;color:#4b5563">NO REPORT</div>
  </div>`,
  iconSize: [72, 36],
  iconAnchor: [36, 18],
})

// ─── Last-updated hook ────────────────────────────────────────────────
function useLastUpdated(data) {
  const [ts, setTs] = useState(null)
  useEffect(() => { if (data) setTs(new Date()) }, [data])
  return ts
}

// ─── SIGMET severity color ────────────────────────────────────────────
const sigmetColor = (sev) => ({
  extreme: '#dc2626', severe: '#ef4444', moderate: '#f59e0b', light: '#3b82f6',
}[sev] || '#64748b')

// ─── Main component ────────────────────────────────────────────────────
export default function WatchOffice() {
  const { data: metarData, loading, refresh } = usePolling(useCallback(() => api.metars(), []), 120000)
  const { data: tafData } = usePolling(useCallback(() => api.tafs(), []), 600000)
  const { data: mapData } = usePolling(useCallback(() => api.mapLayers(), []), 60000)
  const lastUpdated = useLastUpdated(metarData)

  const [activeTab, setActiveTab] = useState('metar')
  const [selectedStation, setSelectedStation] = useState(null)
  const [sigmetForm, setSigmetForm] = useState({
    hazard_type: 'TS', description: 'Embedded thunderstorms observed',
    severity: 'moderate', fl_base: 0, fl_top: 450,
  })
  const [generating, setGenerating] = useState(false)
  const [generatedSigmets, setGeneratedSigmets] = useState([])

  const metars = metarData?.metars || []
  const mapStations = mapData?.stations || []

  // Merge map station (has lat/lon) with METAR data (has full wx)
  const allStations = mapStations.map(s => {
    const metar = metars.find(m => m.station_id === s.icao)
    return metar ? { ...s, ...metar, icao: s.icao, lat: s.lat, lon: s.lon } : s
  })
  // Also include METAR-only stations that have lat/lon
  metars.forEach(m => {
    if (m.lat && m.lon && !allStations.find(s => s.icao === m.station_id)) {
      allStations.push({ ...m, icao: m.station_id })
    }
  })
  const mappableStations = allStations.filter(s => s.lat && s.lon)

  // TAF for selected station
  const selectedTaf = selectedStation
    ? (tafData?.tafs || []).find(t => t.icaoId === selectedStation.icao || t.icaoId === selectedStation.station_id)
    : null

  const generateSigmet = async () => {
    setGenerating(true)
    try {
      const result = await api.generateSigmet(sigmetForm)
      setGeneratedSigmets(prev => [result, ...prev].slice(0, 10))
    } catch (e) {
      console.error(e)
    }
    setGenerating(false)
  }

  // Category breakdown
  const catCounts = {}
  mappableStations.forEach(s => {
    const k = s.flight_category || 'Unknown'
    catCounts[k] = (catCounts[k] || 0) + 1
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Meteorological Watch Office</h2>
          <p className="subtitle">METAR · TAF · AI SIGMET — {mappableStations.length} Bahamas stations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-sm" onClick={refresh}
            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            ↻ Refresh
          </button>
          <div className="live-badge"><div className="live-dot" />LIVE</div>
        </div>
      </div>

      {/* Flight category summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['VFR', '#10b981'], ['MVFR', '#3b82f6'], ['IFR', '#ef4444'], ['LIFR', '#a855f7'], ['Unknown', '#64748b']].map(([cat, color]) => (
          <div key={cat} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: color + '15', border: '1px solid ' + color + '40',
            borderRadius: 8, padding: '5px 12px', fontSize: 12,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
            <span style={{ fontWeight: 700, color }}>{catCounts[cat] || 0}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: -1, position: 'relative', zIndex: 1 }}>
        {[['metar', 'METAR / TAF Map'], ['sigmet', 'SIGMET Generator']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '7px 20px', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', border: '1px solid var(--border)',
            background: activeTab === key ? 'var(--bg-card)' : 'var(--bg-primary)',
            color: activeTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: activeTab === key ? '1px solid var(--bg-card)' : '1px solid var(--border)',
            marginRight: 2,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── METAR / TAF tab ── */}
      {activeTab === 'metar' && (
        <>
          <div style={{ display: 'flex', gap: 12, border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', background: 'var(--bg-card)', padding: 12 }}>
            {/* Map */}
            <div style={{ flex: 1, borderRadius: 8, overflow: 'hidden', height: 580 }}>
              {loading && !metarData ? (
                <div className="loading-spinner"><div className="spinner" /></div>
              ) : (
                <MapContainer center={[24.5, -76.5]} zoom={7} style={{ height: '100%', width: '100%' }}
                  zoomControl attributionControl={false} minZoom={5} maxZoom={18}>
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

                  {mappableStations.map(s => {
                    const id = s.icao || s.station_id
                    const hasData = s.flight_category || s.temp_c != null
                    return (
                      <Marker key={id}
                        position={[s.lat, s.lon]}
                        icon={hasData ? stationMarkerIcon(s) : staleMarkerIcon(id)}
                        eventHandlers={{ click: () => setSelectedStation(s) }}
                      />
                    )
                  })}
                </MapContainer>
              )}
            </div>

            {/* Side panel */}
            <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', maxHeight: 580 }}>
              {selectedStation ? (
                <div>
                  {/* Station header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{selectedStation.icao || selectedStation.station_id}</div>
                      {selectedStation.name && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{selectedStation.name}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {selectedStation.lat?.toFixed(3)}°N, {Math.abs(selectedStation.lon)?.toFixed(3)}°W
                        {selectedStation.elevation_ft != null ? ` · ${selectedStation.elevation_ft}ft` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {selectedStation.flight_category && (
                        <span className={`cat-badge cat-${selectedStation.flight_category}`}>
                          {selectedStation.flight_category}
                        </span>
                      )}
                      <button onClick={() => setSelectedStation(null)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
                    </div>
                  </div>

                  {/* Raw METAR */}
                  {(selectedStation.raw_text || selectedStation.raw_metar) && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        Raw METAR
                      </div>
                      <div className="metar-raw" style={{ fontSize: 11, lineHeight: 1.7, wordBreak: 'break-all' }}>
                        {selectedStation.raw_text || selectedStation.raw_metar}
                      </div>
                    </div>
                  )}

                  {/* Decoded wx fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 13, marginBottom: 14 }}>
                    {[
                      ['Temperature', selectedStation.temp_c != null ? selectedStation.temp_c + '°C' : '—'],
                      ['Dewpoint', selectedStation.dewpoint_c != null ? selectedStation.dewpoint_c + '°C' : '—'],
                      ['Wind', selectedStation.wind_dir_deg != null && selectedStation.wind_speed_kt != null
                        ? selectedStation.wind_dir_deg + '° / ' + selectedStation.wind_speed_kt + 'kt' + (selectedStation.wind_gust_kt ? ' G' + selectedStation.wind_gust_kt : '')
                        : '—'],
                      ['Visibility', selectedStation.visibility_sm != null ? selectedStation.visibility_sm + ' SM' : '—'],
                      ['Altimeter', selectedStation.altimeter_inhg != null ? selectedStation.altimeter_inhg + '" Hg' : '—'],
                      ...(selectedStation.wx_string ? [['Wx Phenomena', selectedStation.wx_string]] : []),
                    ].map(([label, value]) => (
                      <div key={label} style={label === 'Wx Phenomena' ? { gridColumn: '1/-1' } : {}}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
                        <div style={{ fontWeight: 600, marginTop: 1, color: label === 'Wx Phenomena' ? 'var(--warning)' : 'var(--text-primary)' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* TAF section */}
                  {selectedTaf ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                        TAF Forecast
                      </div>
                      <div className="metar-raw" style={{ fontSize: 10, marginBottom: 10, wordBreak: 'break-all', lineHeight: 1.7 }}>
                        {selectedTaf.rawTAF || JSON.stringify(selectedTaf)}
                      </div>
                      {/* 24h forecast periods */}
                      {selectedTaf.fcsts?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            24h Periods
                          </div>
                          {selectedTaf.fcsts.slice(0, 8).map((fc, i) => {
                            const fcat = fc.fcstTimeFrom?.flightCategory
                            const c = CAT_COLORS[fcat] || '#64748b'
                            return (
                              <div key={i} style={{
                                display: 'flex', gap: 8, alignItems: 'center',
                                padding: '5px 8px', borderRadius: 5, marginBottom: 3,
                                background: c + '12', border: '1px solid ' + c + '30', fontSize: 11,
                              }}>
                                <span style={{ color: 'var(--text-muted)', minWidth: 42, fontSize: 10 }}>
                                  {typeof fc.timeFrom === 'string' ? fc.timeFrom.slice(0, 5) : (fc.fcstTimeFrom?.hour != null ? fc.fcstTimeFrom.hour + ':00Z' : '—')}
                                </span>
                                <div style={{ width: 6, height: 6, borderRadius: 3, background: c, flexShrink: 0 }} />
                                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                                  {fc.winds ? `${fc.winds.windDir ?? '—'}°/${fc.winds.windSpd ?? '—'}kt` : ''}{' '}
                                  {fc.visib != null ? `${fc.visib}SM` : ''}
                                </span>
                                {fcat && <span style={{ fontSize: 9, fontWeight: 700, color: c }}>{fcat}</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No TAF available for this station
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state */
                <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>🌤️</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Select a Station</div>
                  <div style={{ fontSize: 12, marginBottom: 28 }}>Click any marker on the map to view METAR + TAF</div>
                  {/* Legend */}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Flight Category
                    </div>
                    {Object.entries(CAT_COLORS).map(([cat, color]) => (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 8px', borderRadius: 5, background: color + '10' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                        <span style={{ fontWeight: 700, color, minWidth: 36, fontSize: 12 }}>{cat}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{CAT_CRITERIA[cat]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick METAR grid below map */}
          {metars.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h3>All Stations ({metars.length})</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Auto-refresh every 2 min · Click to expand</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {metars.map(m => {
                  const color = CAT_COLORS[m.flight_category] || '#64748b'
                  const isSelected = selectedStation && (selectedStation.icao || selectedStation.station_id) === m.station_id
                  return (
                    <div key={m.station_id} onClick={() => {
                      const s = mappableStations.find(st => (st.icao || st.station_id) === m.station_id) || { ...m, icao: m.station_id }
                      setSelectedStation(s)
                      setActiveTab('metar')
                    }} style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: isSelected ? color + '15' : 'var(--bg-primary)',
                      border: '1px solid ' + (isSelected ? color : 'var(--border)'),
                      borderLeft: '3px solid ' + color, transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <strong style={{ fontSize: 13 }}>{m.station_id}</strong>
                        <span style={{ fontSize: 10, fontWeight: 700, color }}>{m.flight_category || '?'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {m.temp_c != null ? m.temp_c + '°C' : '–'} | {m.wind_speed_kt != null ? m.wind_speed_kt + 'kt' : '–'} | {m.visibility_sm != null ? m.visibility_sm + 'SM' : '–'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SIGMET Generator tab ── */}
      {activeTab === 'sigmet' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0 8px 8px 8px', background: 'var(--bg-card)', padding: 16 }}>
          {/* Generated list */}
          {generatedSigmets.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Generated Advisories ({generatedSigmets.length})</h3></div>
              {generatedSigmets.map((s, i) => {
                const sc = sigmetColor(s.severity)
                return (
                  <div key={i} style={{ padding: '12px 0', borderBottom: i < generatedSigmets.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: sc + '20', color: sc, border: '1px solid ' + sc,
                      }}>{(s.severity || 'moderate').toUpperCase()}</span>
                      <span style={{ fontWeight: 600 }}>{s.hazard_name || s.hazard_type}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        FL{String(s.fl_base ?? 0).padStart(3, '0')}/{String(s.fl_top ?? 450).padStart(3, '0')}
                      </span>
                      {s.valid_from && (
                        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>
                          {new Date(s.valid_from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} →{' '}
                          {s.valid_to ? new Date(s.valid_to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}Z
                        </span>
                      )}
                    </div>
                    <div className="metar-raw" style={{ color: '#f59e0b', fontSize: 12, lineHeight: 1.8 }}>
                      {s.raw_text}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Generator form */}
          <div className="card">
            <div className="card-header">
              <h3>AI SIGMET Generator</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ICAO-formatted advisory</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="form-group">
                <label>Hazard Type</label>
                <select value={sigmetForm.hazard_type} onChange={e => setSigmetForm({ ...sigmetForm, hazard_type: e.target.value })} style={{ width: '100%' }}>
                  <option value="TS">Thunderstorm</option>
                  <option value="TURB">Turbulence</option>
                  <option value="ICE">Icing</option>
                  <option value="TC">Tropical Cyclone</option>
                  <option value="CB">Cumulonimbus</option>
                  <option value="LLWS">Low Level Wind Shear</option>
                  <option value="VA">Volcanic Ash</option>
                </select>
              </div>
              <div className="form-group">
                <label>Severity</label>
                <select value={sigmetForm.severity} onChange={e => setSigmetForm({ ...sigmetForm, severity: e.target.value })} style={{ width: '100%' }}>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                  <option value="extreme">Extreme</option>
                </select>
              </div>
              <div className="form-group">
                <label>FL Base / Top</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" value={sigmetForm.fl_base} onChange={e => setSigmetForm({ ...sigmetForm, fl_base: +e.target.value })} style={{ width: '50%' }} />
                  <input type="number" value={sigmetForm.fl_top} onChange={e => setSigmetForm({ ...sigmetForm, fl_top: +e.target.value })} style={{ width: '50%' }} />
                </div>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Hazard Description</label>
              <input type="text" value={sigmetForm.description} onChange={e => setSigmetForm({ ...sigmetForm, description: e.target.value })}
                style={{ width: '100%' }} placeholder="Describe the weather hazard..." />
            </div>
            <button className="btn btn-warning" onClick={generateSigmet} disabled={generating}>
              {generating ? 'Generating...' : '⚡ Generate SIGMET'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
