import { useState } from 'react'
import { api } from '../api/client'
import AiInsightPanel from '../components/AiInsightPanel'

const PROGRESS_STEPS = [
  'Analyzing holdings...',
  'Checking DeFi exposure...',
  'Evaluating risks...',
]

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

function RiskGauge({ score }) {
  const color = getScoreColor(score)
  const radius = 70
  const circumference = Math.PI * radius
  const offset = circumference - (score / 100) * circumference

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
        / 100
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
      const text = typeof res === 'string' ? res : res.report || res.analysis || res.content || JSON.stringify(res, null, 2)
      const riskScore = res.score || res.risk_score || null
      setReport(text)
      if (riskScore != null) setScore(riskScore)
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
      const res = await api.post('/api/ai/risk/score', {})
      setScore(res.score || res.risk_score || res)
    } catch (err) {
      setError(err.message || 'Failed to get risk score')
    } finally {
      setLoadingScore(false)
    }
  }

  const riskLevel = score != null ? getRiskLevel(score) : null

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

      {score != null && !loading && (
        <div style={styles.scoreCard}>
          <RiskGauge score={score} />
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
