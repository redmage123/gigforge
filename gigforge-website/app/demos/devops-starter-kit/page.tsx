'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Tab = 'pipeline' | 'metrics' | 'docker'

interface PipelineStep {
  name: string
  status: 'pending' | 'running' | 'passed' | 'failed'
  duration?: string
  icon: string
}

interface Metric {
  label: string
  value: number
  unit: string
  target: number
  color: string
}

const DOCKER_STAGES = [
  { name: 'deps', label: 'Install deps', size: '142MB', time: '38s', desc: 'npm ci — cached layer' },
  { name: 'build', label: 'Build', size: '18MB', time: '12s', desc: 'tsc + next build' },
  { name: 'prune', label: 'Prune dev deps', size: '—', time: '4s', desc: 'Remove devDependencies' },
  { name: 'release', label: 'Final image', size: '94MB', time: '2s', desc: 'node:20-alpine + production only' },
]

const INITIAL_STEPS: PipelineStep[] = [
  { name: 'Checkout', status: 'pending', icon: '⬇' },
  { name: 'Install dependencies', status: 'pending', icon: '📦' },
  { name: 'Lint', status: 'pending', icon: '🔍' },
  { name: 'Run tests (57 tests)', status: 'pending', icon: '🧪' },
  { name: 'Build', status: 'pending', icon: '🔨' },
  { name: 'Docker build', status: 'pending', icon: '🐳' },
  { name: 'Push to registry', status: 'pending', icon: '🚀' },
  { name: 'Deploy (Railway)', status: 'pending', icon: '✅' },
]

const STEP_DURATIONS = ['1s', '12s', '8s', '24s', '18s', '34s', '9s', '5s']

export default function DevOpsDemo() {
  const [tab, setTab] = useState<Tab>('pipeline')
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS)
  const [running, setRunning] = useState(false)
  const [runComplete, setRunComplete] = useState(false)
  const [runCount, setRunCount] = useState(0)
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Requests/sec', value: 0, unit: 'req/s', target: 847, color: 'text-accent' },
    { label: 'Error rate', value: 0, unit: '%', target: 0.12, color: 'text-green-400' },
    { label: 'p95 latency', value: 0, unit: 'ms', target: 142, color: 'text-violet-400' },
    { label: 'CPU usage', value: 0, unit: '%', target: 34, color: 'text-orange-400' },
  ])
  const [metricsLive, setMetricsLive] = useState(false)
  const [dockerProgress, setDockerProgress] = useState(0)
  const [dockerRunning, setDockerRunning] = useState(false)

  const animateMetrics = useCallback(() => {
    setMetricsLive(true)
    const targets = [847, 0.12, 142, 34]
    let tick = 0
    const interval = setInterval(() => {
      tick++
      setMetrics((prev) => prev.map((m, i) => {
        const target = targets[i]
        const progress = Math.min(tick / 20, 1)
        const noise = (Math.random() - 0.5) * target * 0.05
        return { ...m, value: parseFloat((target * progress + (progress >= 1 ? noise : 0)).toFixed(i === 1 ? 2 : 0)) }
      }))
      if (tick >= 20) clearInterval(interval)
    }, 80)
  }, [])

  async function runPipeline() {
    if (running) return
    setRunning(true)
    setRunComplete(false)
    setRunCount((c) => c + 1)
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' })))

    for (let i = 0; i < INITIAL_STEPS.length; i++) {
      setSteps((prev) => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s))
      const ms = 400 + Math.random() * 400
      await new Promise((r) => setTimeout(r, ms))
      // Simulate occasional flaky test — always pass in demo
      setSteps((prev) => prev.map((s, j) => j === i ? { ...s, status: 'passed', duration: STEP_DURATIONS[i] } : s))
    }
    setRunning(false)
    setRunComplete(true)
  }

  async function buildDocker() {
    if (dockerRunning) return
    setDockerRunning(true)
    setDockerProgress(0)
    for (let i = 0; i <= DOCKER_STAGES.length; i++) {
      await new Promise((r) => setTimeout(r, 700))
      setDockerProgress(i)
    }
    setDockerRunning(false)
  }

  const statusIcon: Record<string, string> = { pending: '○', running: '◌', passed: '✓', failed: '✗' }
  const statusColor: Record<string, string> = {
    pending: 'text-text-muted',
    running: 'text-accent animate-pulse',
    passed: 'text-green-400',
    failed: 'text-red-400',
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/demos" className="text-accent hover:underline mb-6 inline-block text-sm">
        ← All Demos
      </Link>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">⚙️</span>
        <h1 className="text-3xl font-bold text-text-primary">DevOps Starter Kit</h1>
      </div>
      <p className="text-text-secondary mb-8">Run the CI pipeline, watch live Prometheus metrics, and step through a multi-stage Docker build.</p>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-secondary rounded-xl p-1 mb-6 w-fit">
        {(['pipeline', 'metrics', 'docker'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'metrics' && !metricsLive) animateMetrics() }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t === 'pipeline' ? '▶ Pipeline' : t === 'metrics' ? '📊 Metrics' : '🐳 Docker'}
          </button>
        ))}
      </div>

      {/* Pipeline Tab */}
      {tab === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-bg-secondary rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary">GitHub Actions — CI/CD Workflow</h2>
                {runCount > 0 && <p className="text-xs text-text-muted">Run #{runCount} · main branch</p>}
              </div>
              <button
                onClick={runPipeline}
                disabled={running}
                className="bg-accent hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {running ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Running…</> : '▶ Run Pipeline'}
              </button>
            </div>

            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className={`flex items-center gap-3 bg-bg-primary rounded-lg px-4 py-3 transition-all ${step.status === 'running' ? 'border border-accent/50' : 'border border-transparent'}`}>
                  <span className={`font-mono text-sm w-4 ${statusColor[step.status]}`}>{statusIcon[step.status]}</span>
                  <span className="text-lg">{step.icon}</span>
                  <span className={`flex-1 text-sm ${step.status === 'pending' ? 'text-text-muted' : 'text-text-primary'}`}>{step.name}</span>
                  {step.duration && <span className="text-xs text-text-muted font-mono">{step.duration}</span>}
                  {step.status === 'running' && <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />}
                </div>
              ))}
            </div>

            {runComplete && (
              <div className="mt-4 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 flex items-center gap-3">
                <span className="text-green-400 text-lg">✓</span>
                <div>
                  <div className="text-green-300 text-sm font-medium">Pipeline passed — deployed to Railway</div>
                  <div className="text-green-500 text-xs">All {steps.length} steps passed · {STEP_DURATIONS.reduce((a, d) => a + parseInt(d), 0)}s total</div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Workflows included</h3>
              <div className="space-y-2 text-sm">
                {['ci.yml — Test + lint on PR', 'release.yml — Build + push image on tag', 'nightly.yml — Scheduled smoke tests'].map((w) => (
                  <div key={w} className="flex items-start gap-2"><span className="text-accent mt-0.5">✓</span><span className="text-text-secondary">{w}</span></div>
                ))}
              </div>
            </div>
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Deploy targets</h3>
              <div className="space-y-2 text-sm">
                {['Railway (one-command)', 'Fly.io (Dockerfile)', 'VPS via SSH deploy script'].map((d) => (
                  <div key={d} className="flex items-start gap-2"><span className="text-accent mt-0.5">→</span><span className="text-text-secondary">{d}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Tab */}
      {tab === 'metrics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((m) => (
              <div key={m.label} className="bg-bg-secondary rounded-xl p-5 text-center">
                <div className={`text-3xl font-bold font-mono ${m.color} mb-1`}>
                  {m.value}{m.unit}
                </div>
                <div className="text-sm text-text-secondary">{m.label}</div>
                <div className="mt-3 w-full bg-bg-tertiary rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${m.label === 'Error rate' ? 'bg-green-500' : m.label === 'CPU usage' ? 'bg-orange-500' : 'bg-accent'}`}
                    style={{ width: `${Math.min((m.value / m.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-bg-secondary rounded-xl p-6">
            <h3 className="text-base font-semibold text-text-primary mb-4">Prometheus — /metrics endpoint</h3>
            <pre className="bg-bg-primary rounded-lg p-4 text-xs font-mono text-green-400 overflow-x-auto">
{`# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} ${(metrics[0].value * 240).toFixed(0)}
http_requests_total{method="POST",status="201"} ${(metrics[0].value * 12).toFixed(0)}
http_requests_total{method="POST",status="400"} ${Math.floor(metrics[0].value * 0.8)}

# HELP http_request_duration_seconds Request latency
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} ${Math.floor(metrics[0].value * 180)}
http_request_duration_seconds_bucket{le="0.5"} ${Math.floor(metrics[0].value * 235)}
http_request_duration_seconds_p95 ${(metrics[2].value / 1000).toFixed(3)}

# HELP process_cpu_usage_percent CPU utilization
process_cpu_usage_percent ${metrics[3].value}`}
            </pre>
            <p className="text-xs text-text-muted mt-3">Zero-dependency — exported from Express middleware, scraped by Prometheus, visualised in Grafana.</p>
          </div>

          <div className="text-center">
            <button
              onClick={animateMetrics}
              className="bg-bg-secondary hover:bg-bg-tertiary text-text-secondary px-5 py-2 rounded-lg text-sm transition-colors"
            >
              Refresh metrics
            </button>
          </div>
        </div>
      )}

      {/* Docker Tab */}
      {tab === 'docker' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-bg-secondary rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-text-primary">Multi-stage Docker Build</h2>
              <button
                onClick={buildDocker}
                disabled={dockerRunning}
                className="bg-accent hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {dockerRunning ? 'Building…' : '🐳 Build Image'}
              </button>
            </div>

            <div className="space-y-3">
              {DOCKER_STAGES.map((stage, i) => {
                const done = dockerProgress > i
                const active = dockerProgress === i && dockerRunning
                return (
                  <div key={stage.name} className={`rounded-lg p-4 border-2 transition-all ${done ? 'border-green-700 bg-green-900/10' : active ? 'border-accent bg-accent/5' : 'border-bg-tertiary bg-bg-primary'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono ${done ? 'text-green-400' : active ? 'text-accent' : 'text-text-muted'}`}>
                          {done ? '✓' : active ? '◌' : `${i + 1}`}
                        </span>
                        <span className={`text-sm font-semibold ${done || active ? 'text-text-primary' : 'text-text-muted'}`}>
                          Stage: {stage.name}
                        </span>
                      </div>
                      {done && <span className="text-xs text-green-400">{stage.time}</span>}
                      {active && <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />}
                    </div>
                    <div className={`text-xs ${done || active ? 'text-text-secondary' : 'text-text-muted'}`}>{stage.label} — {stage.desc}</div>
                    {done && stage.size !== '—' && (
                      <div className="text-xs text-text-muted mt-1">Layer size: {stage.size}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {dockerProgress >= DOCKER_STAGES.length && (
              <div className="mt-4 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 text-sm">
                <span className="text-green-300 font-medium">✓ Image built — 94MB final size</span>
                <p className="text-green-500 text-xs mt-0.5">85% smaller than a naive build. Ready to push.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Security middleware stack</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { name: 'helmet()', desc: 'Security headers' },
                  { name: 'cors(allowlist)', desc: 'Origin whitelist' },
                  { name: 'rateLimit()', desc: '100 req/min per IP' },
                  { name: 'requestId()', desc: 'Trace correlation' },
                  { name: 'logger()', desc: 'Structured JSON logs' },
                ].map((mw) => (
                  <div key={mw.name} className="flex justify-between items-center bg-bg-primary rounded px-3 py-1.5">
                    <span className="text-accent">{mw.name}</span>
                    <span className="text-text-muted">{mw.desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">Composable — enable per-route or globally.</p>
            </div>
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-2">Grafana dashboard</h3>
              <div className="bg-bg-primary rounded-lg p-4 text-xs font-mono text-text-muted">
                <div className="text-emerald-400 mb-2">{"/* Request rate panel */"}</div>
                <div>rate(http_requests_total[5m])</div>
                <div className="text-emerald-400 mt-2 mb-2">{"/* Error rate */"}</div>
                <div>rate(http_requests_total&#123;status=~&quot;5..&quot;&#125;[5m])</div>
                <div>/ rate(http_requests_total[5m]) * 100</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">61</div><div className="text-xs text-text-secondary">Tests across 7 suites</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">3</div><div className="text-xs text-text-secondary">GitHub Actions workflows</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">94MB</div><div className="text-xs text-text-secondary">Multi-stage Docker image</div></div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/portfolio/devops-starter-kit" className="text-accent hover:underline text-sm mr-6">View case study →</Link>
        <Link href="/contact" className="inline-block bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">Build something similar</Link>
      </div>
    </div>
  )
}
