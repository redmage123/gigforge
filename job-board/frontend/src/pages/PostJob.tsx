import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'
import type { Job } from '../types'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 640, margin: '0 auto', padding: '24px 16px' },
  h1: { margin: '0 0 8px', fontSize: 26, fontWeight: 700 },
  subtitle: { color: '#666', marginBottom: 32 },
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  row: { display: 'flex', gap: 16 },
  field: { flex: 1, marginBottom: 20 },
  label: { display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 5 },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    background: '#fff',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    minHeight: 160,
    padding: '10px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    resize: 'vertical'
  },
  button: {
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer'
  },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14
  },
  hint: { fontSize: 12, color: '#888', marginTop: 3 }
}

export default function PostJob() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [jobType, setJobType] = useState<'full-time' | 'part-time' | 'contract' | 'remote'>('full-time')
  const [salaryRange, setSalaryRange] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const job = await api.post<Job>('/jobs', {
        title,
        description,
        location: location || undefined,
        job_type: jobType,
        salary_range: salaryRange || undefined
      }, token)
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>Post a Job</h1>
      <p style={styles.subtitle}>Reach thousands of qualified candidates</p>

      <div style={styles.card}>
        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="title">Job Title *</label>
            <input
              id="title"
              style={styles.input}
              type="text"
              required
              placeholder="e.g. Senior Software Engineer"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="location">Location</label>
              <input
                id="location"
                style={styles.input}
                type="text"
                placeholder="e.g. London, Remote"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="jobType">Job Type *</label>
              <select
                id="jobType"
                style={styles.select}
                value={jobType}
                onChange={e => setJobType(e.target.value as typeof jobType)}
              >
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="remote">Remote</option>
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="salary">Salary Range</label>
            <input
              id="salary"
              style={styles.input}
              type="text"
              placeholder="e.g. £50,000 - £70,000"
              value={salaryRange}
              onChange={e => setSalaryRange(e.target.value)}
            />
            <span style={styles.hint}>Optional — jobs with salary ranges get 40% more applications</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="description">Job Description *</label>
            <textarea
              id="description"
              style={styles.textarea}
              required
              placeholder="Describe the role, responsibilities, requirements, and benefits..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Posting...' : 'Post Job'}
          </button>
        </form>
      </div>
    </div>
  )
}
