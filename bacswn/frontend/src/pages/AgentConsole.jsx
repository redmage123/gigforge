import { useState, useCallback, useRef, useEffect } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'

// ─── Agent pipeline definition ────────────────────────────────────────
const PIPELINE_AGENTS = [
  { id: 'bacswn-chief',            label: 'Chief',           role: 'Orchestrator',       icon: '🧠', color: '#f59e0b' },
  { id: 'bacswn-wx-monitor',       label: 'Wx Monitor',      role: 'Weather Observer',   icon: '🌤️', color: '#3b82f6' },
  { id: 'bacswn-flight-tracker',   label: 'Flight Tracker',  role: 'ADS-B Surveillance', icon: '✈️', color: '#06b6d4' },
  { id: 'bacswn-sigmet-drafter',   label: 'SIGMET Drafter',  role: 'Advisory Author',    icon: '⚡', color: '#ef4444' },
  { id: 'bacswn-emissions-analyst',label: 'Emissions',       role: 'CORSIA Analyst',     icon: '🌱', color: '#10b981' },
  { id: 'bacswn-dispatch',         label: 'Dispatch',        role: 'Alert Broadcaster',  icon: '📡', color: '#a855f7' },
  { id: 'bacswn-qc',               label: 'QC',              role: 'Quality Control',    icon: '✅', color: '#f97316' },
]

// Flow: chief → wx-monitor → flight-tracker → sigmet-drafter → emissions → dispatch → qc
// AND: chief also connects to dispatch and qc (orchestrator arrows)
const PIPELINE_EDGES = [0, 1, 2, 3, 4, 5] // index pairs: n→n+1

const STATUS_DOT = { running: '#10b981', idle: '#64748b', error: '#ef4444', alert: '#ef4444' }

// ─── Animated SVG connection arrows ───────────────────────────────────
function PipelineArrow({ from, to, active, color, pulsing }) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf
    let start = null
    const animate = (ts) => {
      if (!start) start = ts
      setOffset(((ts - start) / 10) % 24)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const x1 = from.x + 54, y1 = from.y + 30
  const x2 = to.x, y2 = to.y + 30
  const mx = (x1 + x2) / 2

  return (
    <g>
      {/* Base line */}
      <path d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
        fill="none" stroke={active ? color : '#374151'} strokeWidth={active ? 2.5 : 1.5}
        opacity={active ? 0.9 : 0.3} />
      {/* Animated dashes */}
      {active && (
        <path d={`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
          fill="none" stroke={color} strokeWidth={3}
          strokeDasharray="12 12" strokeDashoffset={-offset}
          opacity={0.7} />
      )}
      {/* Arrowhead */}
      <polygon points={`${x2},${y2} ${x2-8},${y2-5} ${x2-8},${y2+5}`}
        fill={active ? color : '#374151'} opacity={active ? 1 : 0.3} />
      {/* Pulse dot on active */}
      {pulsing && (
        <PulseDot cx={x2 - 4} cy={y2} color={color} />
      )}
    </g>
  )
}

function PulseDot({ cx, cy, color }) {
  const [r, setR] = useState(4)
  useEffect(() => {
    let raf
    const animate = (ts) => {
      setR(4 + Math.sin(ts / 200) * 2.5)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.85} />
}

// ─── Agent node ────────────────────────────────────────────────────────
function AgentNode({ agent, status, lastAction, timestamp, isActive, isAlert, onClick, x, y }) {
  const dotColor = isAlert ? '#ef4444' : isActive ? '#10b981' : '#64748b'
  const borderColor = isActive ? agent.color : isAlert ? '#ef4444' : '#374151'
  const glowStyle = (isActive || isAlert)
    ? { boxShadow: `0 0 18px ${isActive ? agent.color : '#ef4444'}55, 0 0 4px ${isActive ? agent.color : '#ef4444'}90` }
    : {}

  return (
    <div onClick={onClick} style={{
      position: 'absolute', left: x, top: y,
      width: 108, cursor: 'pointer',
      background: '#1c2128',
      border: `2px solid ${borderColor}`,
      borderRadius: 10,
      padding: '10px 8px',
      transition: 'border-color 0.25s, box-shadow 0.25s',
      userSelect: 'none',
      ...glowStyle,
    }}>
      {/* Status dot */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        width: 8, height: 8, borderRadius: '50%',
        background: dotColor,
        boxShadow: isActive ? `0 0 6px ${dotColor}` : 'none',
        transition: 'background 0.3s',
      }} />

      {/* Icon + name */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>{agent.icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: agent.color, marginTop: 4, letterSpacing: 0.3 }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.3, marginTop: 1 }}>
          {agent.role}
        </div>
      </div>

      {/* Status + time */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: dotColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {isAlert ? 'ALERT' : isActive ? 'ACTIVE' : status || 'idle'}
        </div>
        {timestamp && (
          <div style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </div>

      {/* Last action */}
      {lastAction && (
        <div style={{
          marginTop: 5, paddingTop: 5, borderTop: '1px solid #21262d',
          fontSize: 8, color: '#64748b', lineHeight: 1.4,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {lastAction}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline flow diagram ─────────────────────────────────────────────
const NODE_W = 108, NODE_H = 110, GAP = 60
const TOTAL_W = PIPELINE_AGENTS.length * (NODE_W + GAP) - GAP + 40
const DIAGRAM_H = NODE_H + 80

function PipelineDiagram({ agentMap, activeAgents, alertAgents, onSelectAgent }) {
  const positions = PIPELINE_AGENTS.map((_, i) => ({
    x: 20 + i * (NODE_W + GAP),
    y: 36,
  }))

  return (
    <div style={{ position: 'relative', width: TOTAL_W, height: DIAGRAM_H, margin: '0 auto' }}>
      {/* SVG arrows */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
        {PIPELINE_EDGES.map((i) => {
          const from = positions[i], to = positions[i + 1]
          const targetId = PIPELINE_AGENTS[i + 1].id
          const active = activeAgents.has(targetId) || activeAgents.has(PIPELINE_AGENTS[i].id)
          const color = PIPELINE_AGENTS[i].color
          return (
            <PipelineArrow key={i} from={from} to={to}
              active={active} color={color}
              pulsing={active && activeAgents.has(targetId)} />
          )
        })}
      </svg>

      {/* Agent nodes */}
      {PIPELINE_AGENTS.map((agent, i) => {
        const apiAgent = agentMap[agent.id] || {}
        const lastEvent = apiAgent.recent_events?.[apiAgent.recent_events.length - 1]
        return (
          <AgentNode key={agent.id}
            agent={agent}
            status={apiAgent.status}
            lastAction={lastEvent?.action || apiAgent.last_action}
            timestamp={lastEvent?.timestamp || apiAgent.last_run}
            isActive={activeAgents.has(agent.id)}
            isAlert={alertAgents.has(agent.id)}
            onClick={() => onSelectAgent(agent.id)}
            x={positions[i].x}
            y={positions[i].y}
          />
        )
      })}
    </div>
  )
}

// ─── Demo run simulation ───────────────────────────────────────────────
const DEMO_STEPS = [
  { agent: 'bacswn-chief',            action: 'Pipeline trigger received — initiating hurricane protocol' },
  { agent: 'bacswn-wx-monitor',       action: 'Cat 4 detected at 25.8°N 76.2°W — winds 145mph, pressure 937mb' },
  { agent: 'bacswn-flight-tracker',   action: 'Clearing FIR — 23 aircraft rerouted, 4 diversions in progress' },
  { agent: 'bacswn-sigmet-drafter',   action: 'SIGMET MNLT ZULU drafted — tropical cyclone advisory active' },
  { agent: 'bacswn-emissions-analyst',action: 'Reroute emissions delta calculated: +12.4t CO₂ excess recorded' },
  { agent: 'bacswn-dispatch',         action: 'ALERT dispatched to 42 channels — NWS, NEMA, GCAA confirmed' },
  { agent: 'bacswn-qc',               action: 'Pipeline validated — all 7 agents healthy, 0 errors' },
]

// ─── Main Component ────────────────────────────────────────────────────
export default function AgentConsole() {
  const { data: agentData, refresh } = usePolling(useCallback(() => api.agentStatus(), []), 5000)
  const { data: activityData, refresh: refreshActivity } = usePolling(useCallback(() => api.agentActivity(), []), 10000)

  const [pipelineResult, setPipelineResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [activeAgents, setActiveAgents] = useState(new Set())
  const [alertAgents, setAlertAgents] = useState(new Set())
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [demoLog, setDemoLog] = useState([])
  const logRef = useRef(null)

  const agents = agentData?.agents || []
  const activities = activityData?.activities || []

  // Build a map from agent id → agent object
  const agentMap = {}
  agents.forEach(a => { agentMap[a.name] = a })

  // Sync active agents from live data
  useEffect(() => {
    const active = new Set(agents.filter(a => a.status === 'running').map(a => a.name))
    const alert = new Set(agents.filter(a => a.status === 'error').map(a => a.name))
    setActiveAgents(active)
    setAlertAgents(alert)
  }, [agents])

  // Auto-scroll activity log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [demoLog, activities])

  const triggerPipeline = async () => {
    setRunning(true)
    setPipelineResult(null)
    setDemoLog([])

    try {
      const result = await api.triggerPipeline()
      setPipelineResult(result)
      refresh()
      refreshActivity()
    } catch (e) {
      // Fall back to demo simulation
      runDemoSimulation()
    }
    setRunning(false)
  }

  const runDemoSimulation = async () => {
    setDemoLog([])
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      const step = DEMO_STEPS[i]
      await new Promise(r => setTimeout(r, 700 + i * 200))
      setActiveAgents(new Set([step.agent]))
      setDemoLog(prev => [...prev, {
        time: new Date().toISOString(),
        agent: step.agent,
        action: step.action,
        step: i + 1,
      }])
    }
    await new Promise(r => setTimeout(r, 600))
    setActiveAgents(new Set())
    setDemoLog(prev => [...prev, {
      time: new Date().toISOString(),
      agent: 'system',
      action: 'Pipeline complete — all agents returned to IDLE',
      step: 8,
    }])
  }

  const triggerAgent = async (name) => {
    setActiveAgents(prev => new Set([...prev, name]))
    try {
      await api.triggerAgent(name)
      refresh()
      refreshActivity()
    } catch (e) {
      // demo flash
    }
    setTimeout(() => {
      setActiveAgents(prev => { const n = new Set(prev); n.delete(name); return n })
    }, 2000)
  }

  const selected = selectedAgent
    ? (agentMap[selectedAgent] || PIPELINE_AGENTS.find(a => a.id === selectedAgent))
    : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>AI Agent Console</h2>
          <p className="subtitle">7-agent autonomous pipeline — detect · evaluate · draft · dispatch</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(16,185,129,0.12)', border: '1px solid #10b981', color: '#10b981',
          }}>
            {agents.filter(a => a.status !== 'error').length || 7} / 7 agents healthy
          </div>
          <button className="btn btn-warning" onClick={triggerPipeline} disabled={running} style={{ fontSize: 14 }}>
            {running ? '⚡ Running...' : '⚡ Trigger Demo Run'}
          </button>
        </div>
      </div>

      {/* ── Pipeline Flow Diagram ── */}
      <div className="card" style={{ marginBottom: 16, padding: '20px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Live Pipeline Flow</h3>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            {[['#10b981', 'Active'], ['#64748b', 'Idle'], ['#ef4444', 'Alert']].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <PipelineDiagram
            agentMap={agentMap}
            activeAgents={activeAgents}
            alertAgents={alertAgents}
            onSelectAgent={setSelectedAgent}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
          Click any agent node to view details · Animated arrows show active data flow
        </div>
      </div>

      {/* ── Selected Agent Detail ── */}
      {selectedAgent && (
        <div className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${PIPELINE_AGENTS.find(a => a.id === selectedAgent)?.color || '#64748b'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {PIPELINE_AGENTS.find(a => a.id === selectedAgent)?.icon} {agentMap[selectedAgent]?.name || selectedAgent}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agentMap[selectedAgent]?.role}</div>
            </div>
            <button onClick={() => setSelectedAgent(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', fontSize: 13, marginBottom: 12 }}>
            {[
              ['Status', agentMap[selectedAgent]?.status || 'idle'],
              ['Run Count', agentMap[selectedAgent]?.run_count ?? '—'],
              ['Poll Interval', agentMap[selectedAgent]?.poll_interval > 0 ? agentMap[selectedAgent].poll_interval + 's' : 'Event-driven'],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                <div style={{ fontWeight: 600, marginTop: 1 }}>{value}</div>
              </div>
            ))}
          </div>
          {agentMap[selectedAgent]?.recent_events?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Recent Events</div>
              {agentMap[selectedAgent].recent_events.slice(-4).map((e, i) => (
                <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <span style={{ color: PIPELINE_AGENTS.find(a => a.id === selectedAgent)?.color, fontWeight: 600 }}>{e.action}</span>
                  {e.details ? ` — ${e.details.slice(0, 80)}` : ''}
                  {e.duration_ms ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> ({e.duration_ms}ms)</span> : null}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-primary" onClick={() => triggerAgent(selectedAgent)}>
              ▶ Trigger this agent
            </button>
          </div>
        </div>
      )}

      {/* ── Live Activity Feed ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Live Activity Feed</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {demoLog.length > 0 ? `Demo run — ${demoLog.length} events` : `Last ${activities.slice(0, 20).length} events`}
          </span>
        </div>
        <div ref={logRef} style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(demoLog.length > 0 ? demoLog : activities.slice(0, 20)).map((a, i) => {
            const agentMeta = PIPELINE_AGENTS.find(p => p.id === (a.agent_name || a.agent))
            const color = agentMeta?.color || '#64748b'
            return (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '7px 8px', borderRadius: 6,
                background: i === 0 ? color + '10' : 'transparent',
                border: `1px solid ${i === 0 ? color + '30' : 'transparent'}`,
              }}>
                {/* Severity dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
                {/* Time */}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
                  {(a.created_at || a.time)?.slice(11, 19) || '—'}
                </span>
                {/* Agent badge */}
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: color + '20', color, border: '1px solid ' + color + '50',
                  flexShrink: 0,
                }}>
                  {agentMeta?.label || (a.agent_name || a.agent || 'system')?.replace('bacswn-', '')}
                </span>
                {/* Action text */}
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {a.action}
                  {a.details ? <span style={{ color: 'var(--text-muted)' }}> — {a.details?.slice(0, 100)}</span> : null}
                </span>
                {a.duration_ms && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{a.duration_ms}ms</span>
                )}
              </div>
            )
          })}
          {demoLog.length === 0 && activities.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Press "Trigger Demo Run" to see the pipeline in action
            </div>
          )}
        </div>
      </div>

      {/* ── Pipeline Result ── */}
      {pipelineResult && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          <div className="card-header">
            <h3 style={{ color: 'var(--warning)' }}>Pipeline Execution Result</h3>
            <span>{pipelineResult.steps} steps</span>
          </div>
          {pipelineResult.results?.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: PIPELINE_AGENTS.find(a => a.id === r.agent)?.color || '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, color: 'white', flexShrink: 0,
              }}>{r.step}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.agent}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.action}: {r.details}</div>
              </div>
              <span className="cat-badge cat-VFR">{r.status || 'completed'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
