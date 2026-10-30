/** Bright hazard colours for map symbols drawn over satellite imagery. */
export const HAZARD_COLORS = {
  CLEAR: '#10b981', SHOWERS: '#3b82f6', IFR: '#a855f7', TSRA: '#f59e0b', SQUALL: '#ef4444',
}
/** Hazard colour for TEXT on page surfaces — a CSS variable that meets 4.5:1 in both themes. */
export const hz = (call) => `var(--hz-${String(call || 'clear').toLowerCase()})`

const SENSOR_FIELDS = [
  ['temp_c', 'Temp', '°C', null],
  ['pressure_hpa', 'Pressure', 'hPa', 'pressure'],
  ['wind_kt', 'Wind', 'kt', 'wind'],
  ['gust_kt', 'Gust', 'kt', 'wind'],
  ['rain_mm_h', 'Rain', 'mm/h', 'rain'],
  ['visibility_sm', 'Vis', 'SM', 'visibility'],
  ['ceiling_ft', 'Ceiling', 'ft', 'visibility'],
  ['humidity_pct', 'RH', '%', null],
]

function Precog({ pc, majority, split }) {
  const color = hz(pc.call)
  const dissent = !pc.quarantined && !split && pc.call !== majority
  const cls = ['precog', dissent && 'dissent', pc.quarantined && 'quarantined', pc.corrupted && 'corrupted'].filter(Boolean).join(' ')
  return (
    <li className={cls} style={{ color }}>
      <div className="eye" aria-hidden="true" />
      <h4 className="name" style={{ color: 'var(--text-primary)' }}>{pc.id}</h4>
      <div className="modality">{pc.modality}</div>
      <div className="call"><span className="sr-only">Call: </span>{pc.call}</div>
      <div className="conf" role="meter" aria-label={`${pc.id} confidence`} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(pc.confidence * 100)} aria-valuetext={`${Math.round(pc.confidence * 100)} percent`}
        title={`Confidence ${Math.round(pc.confidence * 100)}%`}><div style={{ width: `${pc.confidence * 100}%` }} /></div>
      <div className="badge-row">
        {dissent && <span className="mbadge amber">MINORITY REPORT</span>}
        {pc.quarantined && <span className="mbadge grey">QUARANTINED</span>}
        {pc.corrupted && <span className="mbadge red">CORRUPTED</span>}
      </div>
      <div className="reason" title={pc.reason}><span className="sr-only">Reasoning: </span>{pc.reason}</div>
    </li>
  )
}

/** Selected station: its 2-of-3 ensemble, sensors, route to hub, and fault controls. */
export default function PrecogChamber({ node, hub, onFault, onVerify, busy }) {
  if (!node) {
    return (
      <div className="chamber">
        <div className="chamber-head"><h3>Precog Chamber</h3><p>Select a station on the map.</p></div>
      </div>
    )
  }
  const v = node.verdict
  const vColor = hz(v.call)
  const statusBadge = { healthy: 'green', caution: 'amber', degraded: 'red', offline: 'grey' }[node.status]
  const faulted = new Set(node.sensor_faults)
  const act = (fault) => onFault({ station: node.station, ...fault })

  return (
    <section className="chamber" aria-labelledby="chamber-h">
      <div className="chamber-head">
        <h3 id="chamber-h">
          {node.station} {node.is_hub && <span className="mbadge blue">HUB</span>}
          <span className={`mbadge ${statusBadge}`}>{node.status.toUpperCase()}</span>
        </h3>
        <p>{node.name} · {node.peers.length} live peers · {node.msgs_sent.toLocaleString()} sent / {node.msgs_recv.toLocaleString()} recv</p>
      </div>
      <div className="chamber-body">
        {!node.alive ? (
          <div className="verdict" style={{ borderColor: '#475569' }}>
            <div><small>Station offline</small><div className="big" style={{ color: '#64748b' }}>NO SIGNAL</div></div>
            <button className="btn btn-sm btn-success" onClick={() => act({ kind: 'node_up' })} disabled={busy}>Bring online</button>
          </div>
        ) : (
          <>
            <div className="verdict" style={{ borderColor: vColor }}>
              <div>
                <small>Ensemble verdict</small>
                <div className="big" style={{ color: vColor }}>{v.call}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <small>Agreement</small>
                <div style={{ fontWeight: 800, fontSize: 18, color: v.split ? 'var(--warning)' : 'var(--text-primary)' }}>{v.agreement}</div>
                <small>ground truth: <b style={{ color: hz(node.truth) }}>{node.truth}</b></small>
              </div>
            </div>
            {v.split && <div className="mbadge amber" style={{ padding: 6, fontSize: 11 }}>ENSEMBLE SPLIT — no 2-of-3 majority, holding previous verdict, no autonomous action</div>}
            {node.suspect && <div className="mbadge red" style={{ padding: 6, fontSize: 11 }}>{node.suspect}</div>}

            <ul className="precogs" aria-label="Three-model ensemble">
              {node.precogs.map(pc => <Precog key={pc.id} pc={pc} majority={v.call} split={v.split} />)}
            </ul>

            {node.warnings.length > 0 && (
              <div>
                <div className="section-label">Inbound hand-offs from peers</div>
                {node.warnings.map(w => (
                  <div key={w.from + w.call} style={{ fontSize: 12 }}>
                    <b>{w.from}</b> → <span style={{ color: hz(w.call) }}>{w.call}</span> ETA {w.eta_ticks * 5} min
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="section-label">Sensors</div>
              <div className="sensor-grid">
                {SENSOR_FIELDS.map(([k, label, unit, fault]) => (
                  <div key={k} className={fault && faulted.has(fault) ? 'faulted' : ''}>
                    <label>{label}</label><span>{node.sensors?.[k] ?? '—'}<small style={{ color: 'var(--text-muted)' }}> {unit}</small></span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="section-label">Route to hub ({hub})</div>
              {node.is_hub ? <div className="route"><b>{hub}</b> local NOC</div>
                : node.route_to_hub ? (
                  <div className="route">
                    {node.route_to_hub.path.map((s, i) => <span key={s}>{i > 0 && '→ '}<b>{s}</b></span>)}
                    <span className="dim" style={{ marginLeft: 6 }}>{node.route_to_hub.hops} hops · {node.route_to_hub.latency_ms} ms</span>
                  </div>
                ) : <div className="route" style={{ color: 'var(--danger)' }}>NO ROUTE — store-and-forward ({node.queue} queued)</div>}
            </div>
          </>
        )}

        <div>
          <div className="section-label">Inject fault</div>
          <div className="fault-row">
            {node.alive && <button className="mesh-chip danger" disabled={busy} onClick={() => act({ kind: 'node_down' })}>Take offline</button>}
            {node.precogs.map(pc => (
              <button key={pc.id} className="mesh-chip danger" disabled={busy || pc.corrupted} onClick={() => act({ kind: 'corrupt_precog', precog: pc.id })}>
                Corrupt {pc.id}
              </button>
            ))}
            {['visibility', 'wind', 'pressure', 'rain'].map(s => (
              <button key={s} className="mesh-chip danger" disabled={busy || faulted.has(s)} onClick={() => act({ kind: 'sensor_fault', sensor: s })}>
                Stick {s}
              </button>
            ))}
            <button className="mesh-chip" disabled={busy} onClick={() => act({ kind: 'clear' })}>Clear faults</button>
            {node.alive && <button className="mesh-chip" disabled={busy} onClick={() => onVerify(node.station)}>Ask peers to verify</button>}
          </div>
        </div>
      </div>
    </section>
  )
}
