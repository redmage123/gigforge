import { useState } from 'react'
import { api } from '../api/client'
import AiInsightPanel from '../components/AiInsightPanel'

const PROGRESS_STEPS = [
  'Analyzing holdings...',
  'Checking DeFi exposure...',
  'Evaluating risks...',
]

// The full report states "overall risk score: N/10" in prose; pick it out for the gauge
function scoreFromReport(text) {
  const m = /risk score[^0-9]{0,40}(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10\b/i.exec(text || '')
  if (!m) return null
  const value = Number(m[1])
  return value >= 0 && value <= 10 ? { value, max: 10 } : null
}

function getScoreColor(score) {
  if (score < 30) return '#4ade80'
  if (score < 60) return '#facc15'
  if (score < 80) return '#fb923c'
  return '#f87171'
}

function getRiskLevel(score) {
  if (score < 30) return { label: 'Low', color: '#4ade80' }
  if (score < 60) return { label: 'Medium', color: '#facc15' }
  if (score < 80) return { label: 'High', color: '#fb923c' }
  return { label: 'Critical', color: '#f87171' }
}

const styles = {
  btnRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
  },
  primaryBtn: {
    padding: '0.6rem 1.5rem',
    background: '#7b61ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  quickBtn: {
    padding: '0.6rem 1.5rem',
    background: 'transparent',
    color: '#00d4aa',
    border: '1px solid #00d4aa',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  gaugeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '2rem',
  },
  scoreCard: {
    background: '#111827',
    border: '1px solid #2a2a3d',
    borderRadius: 12,
    padding: '1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2rem',
    flexWrap: 'wrap',
  },
  badge: {
    padding: '0.4rem 1rem',
    borderRadius: 20,
    fontWeight: 700,
    fontSize: '1rem',
  },
  progressContainer: {
    background: '#111827',
    border: '1px solid #2a2a3d',
    borderRadius: 12,
    padding: '2rem',
    marginBottom: '1.5rem',
  },
  progressStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0',
    color: '#64748b',
    fontSize: '0.95rem',
    transition: 'color 0.3s',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: '1rem',
  },
}

function RiskGauge({ score, max = 100 }) {
  const pct = (score / max) * 100
  const color = getScoreColor(pct)
  const radius = 70
  const circumference = Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <svg width="180" height="110" viewBox="0 0 180 110">
      <path
        d="M 10 100 A 70 70 0 0 1 170 100"
        fill="none"
        stroke="#1e293b"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M 10 100 A 70 70 0 0 1 170 100"
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x="90" y="85" textAnchor="middle" fill={color} fontSize="32" fontWeight="700">
        {score}
      </text>
      <text x="90" y="105" textAnchor="middle" fill="#64748b" fontSize="12">
        / {max}
      </text>
    </svg>
  )
}

export default function AiRiskReport() {
  const [report, setReport] = useState(null)
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingScore, setLoadingScore] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [error, setError] = useState('')

  const generateReport = async () => {
    setLoading(true)
    setError('')
    setReport(null)
    setScore(null)
    setProgressStep(0)

    const interval = setInterval(() => {
      setProgressStep((prev) => Math.min(prev + 1, PROGRESS_STEPS.length - 1))
    }, 1500)

    try {
      const res = await api.post('/api/ai/risk/assessment', {})
      const text = typeof res === 'string' ? res : res.report || res.analysis || 'No report returned.'
      setReport(text)
      setScore(scoreFromReport(text))
    } catch (err) {
      setError(err.message || 'Failed to generate report')
    } finally {
      clearInterval(interval)
      setLoading(false)
    }
  }

  const getScoreOnly = async () => {
    setLoadingScore(true)
    setError('')
    try {
      setScore(null)
      const res = await api.post('/api/ai/risk/score', {})
      // {overall_score: 1-100, risk_level, top_risks}; raw_response means the AI reply could not be read
      const value = Number(res.overall_score ?? res.score ?? res.risk_score)
      if (res.raw_response || !Number.isFinite(value)) {
        const raw = String(res.raw_response || '')
        throw new Error(raw.startsWith('Error:') ? raw : 'The AI did not return a usable risk score. Try again.')
      }
      setScore({ value: Math.min(100, Math.max(0, value)), max: 100, risks: Array.isArray(res.top_risks) ? res.top_risks : [] })
    } catch (err) {
      setError(err.message || 'Failed to get risk score')
    } finally {
      setLoadingScore(false)
    }
  }

  const pct = score ? (score.value / score.max) * 100 : null
  const riskLevel = score ? getRiskLevel(pct) : null

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', marginBottom: '1rem' }}>AI Risk Assessment</h1>

      <div style={styles.btnRow}>
        <button style={styles.primaryBtn} onClick={generateReport} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Risk Report'}
        </button>
        <button style={styles.quickBtn} onClick={getScoreOnly} disabled={loadingScore}>
          {loadingScore ? 'Loading...' : 'Get Risk Score Only'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {loading && (
        <div style={styles.progressContainer}>
          {PROGRESS_STEPS.map((step, i) => (
            <div
              key={i}
              style={{
                ...styles.progressStep,
                color: i <= progressStep ? '#e2e8f0' : '#64748b',
              }}
            >
              <span style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                background: i <= progressStep ? '#7b61ff' : '#1e293b',
                color: i <= progressStep ? '#fff' : '#64748b',
                flexShrink: 0,
              }}>
                {i < progressStep ? '\u2713' : i + 1}
              </span>
              {step}
              {i === progressStep && <span style={{ color: '#7b61ff', animation: 'pulse 1s infinite' }}> ...</span>}
            </div>
          ))}
        </div>
      )}

      {score && !loading && (
        <div style={styles.scoreCard}>
          <RiskGauge score={score.value} max={score.max} />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                ...styles.badge,
                background: riskLevel.color + '22',
                color: riskLevel.color,
                border: `1px solid ${riskLevel.color}`,
              }}
            >
              {riskLevel.label} Risk
            </div>
          </div>
          {score.risks?.length > 0 && (
            <ul style={{ color: '#e2e8f0', fontSize: '0.9rem', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              {score.risks.map((r, i) => <li key={i}>{String(r)}</li>)}
            </ul>
          )}
        </div>
      )}

      {report && !loading && (
        <AiInsightPanel
          title="Risk Assessment Report"
          content={report}
          onRefresh={generateReport}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
