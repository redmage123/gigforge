import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'
import type { Job } from '../types'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 720, margin: '0 auto', padding: '24px 16px' },
  back: { color: '#3b5bdb', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 20 },
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  header: { marginBottom: 24 },
  title: { margin: '0 0 8px', fontSize: 28, fontWeight: 700 },
  employer: { color: '#555', fontSize: 16, marginBottom: 12 },
  tags: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tag: {
    background: '#f0f4ff',
    color: '#3b5bdb',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500
  },
  divider: { border: 'none', borderTop: '1px solid #eee', margin: '24px 0' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#444' },
  description: { lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap' },
  applyBox: {
    marginTop: 32,
    padding: 24,
    background: '#f8f9ff',
    border: '1px solid #dde3ff',
    borderRadius: 10
  },
  applyTitle: { margin: '0 0 12px', fontWeight: 600, fontSize: 16 },
  textarea: {
    width: '100%',
    minHeight: 120,
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
    resize: 'vertical',
    marginBottom: 12
  },
  applyBtn: {
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer'
  },
  success: {
    background: '#e6f4ea',
    border: '1px solid #a8d5b5',
    color: '#2d6a4f',
    padding: 14,
    borderRadius: 6,
    marginTop: 12
  },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: 14,
    borderRadius: 6,
    marginTop: 12
  },
  loading: { textAlign: 'center', padding: 40, color: '#666' }
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [coverLetter, setCoverLetter] = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api.get<Job>(`/jobs/${id}`)
      .then(data => { setJob(data); setLoading(false) })
      .catch(err => {
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load job')
        setLoading(false)
      })
  }, [id])

  async function handleApply(e: FormEvent) {
    e.preventDefault()
    if (!user || !token || !id) return
    setApplying(true)
    setApplyError(null)
    try {
      await api.post(`/jobs/${id}/apply`, { cover_letter: coverLetter }, token)
      setApplied(true)
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : 'Failed to submit application')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div style={styles.loading}>Loading...</div>
  if (loadError) return <div style={{ ...styles.container, ...styles.error }}>{loadError}</div>
  if (!job) return null

  const posted = new Date(job.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div style={styles.container}>
      <Link to="/jobs" style={styles.back}>← Back to jobs</Link>

      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>{job.title}</h1>
          {job.employer_name && <p style={styles.employer}>{job.employer_name}</p>}
          <div style={styles.tags}>
            {job.location && <span style={styles.tag}>📍 {job.location}</span>}
            <span style={styles.tag}>{job.job_type}</span>
            {job.salary_range && <span style={styles.tag}>{job.salary_range}</span>}
            <span style={{ ...styles.tag, background: '#e6f4ea', color: '#2d6a4f' }}>
              {job.status === 'open' ? 'Hiring' : job.status}
            </span>
          </div>
        </div>

        <hr style={styles.divider} />

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Job Description</h2>
          <p style={styles.description}>{job.description}</p>
        </div>

        <p style={{ color: '#888', fontSize: 13 }}>Posted {posted}</p>

        {/* Apply section */}
        {user?.role === 'applicant' && job.status === 'open' && (
          <div style={styles.applyBox}>
            {applied ? (
              <div style={styles.success}>
                Application submitted successfully! You can track it in My Applications.
              </div>
            ) : (
              <>
                <h3 style={styles.applyTitle}>Apply for this position</h3>
                <form onSubmit={handleApply}>
                  <textarea
                    style={styles.textarea}
                    placeholder="Cover letter (optional) — tell us why you're a great fit..."
                    value={coverLetter}
                    onChange={e => setCoverLetter(e.target.value)}
                  />
                  <button style={styles.applyBtn} type="submit" disabled={applying}>
                    {applying ? 'Submitting...' : 'Submit Application'}
                  </button>
                  {applyError && <div style={styles.error}>{applyError}</div>}
                </form>
              </>
            )}
          </div>
        )}

        {!user && job.status === 'open' && (
          <div style={styles.applyBox}>
            <p style={{ margin: 0, color: '#555' }}>
              <Link to="/login" style={{ color: '#3b5bdb' }}>Sign in</Link> or{' '}
              <Link to="/register" style={{ color: '#3b5bdb' }}>create an account</Link> to apply.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
