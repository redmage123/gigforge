import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { api, ApiError } from '../api/client'
import { JobCard } from '../components/JobCard'
import { SearchBar } from '../components/SearchBar'
import type { Job } from '../types'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 800, margin: '0 auto', padding: '24px 16px' },
  header: { marginBottom: 8, fontSize: 28, fontWeight: 700 },
  subheader: { color: '#666', marginBottom: 24, fontSize: 15 },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16
  },
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  empty: { textAlign: 'center', padding: 60, color: '#888' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  pagination: { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 },
  pageBtn: (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    border: `1px solid ${active ? '#3b5bdb' : '#ccc'}`,
    background: active ? '#3b5bdb' : '#fff',
    color: active ? '#fff' : '#333',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14
  })
}

export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(parseInt(searchParams.get('page') ?? '1', 10))

  const q = searchParams.get('q') ?? ''
  const location = searchParams.get('location') ?? ''

  const fetchJobs = useCallback(async (query: string, loc: string, pg: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (loc) params.set('location', loc)
      params.set('page', String(pg))

      const data = await api.get<{ jobs: Job[]; page: number }>(`/jobs?${params}`)
      setJobs(data.jobs)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load jobs')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs(q, location, page)
  }, [fetchJobs, q, location, page])

  function handleSearch(newQ: string, newLocation: string) {
    setPage(1)
    const params: Record<string, string> = {}
    if (newQ) params.q = newQ
    if (newLocation) params.location = newLocation
    setSearchParams(params)
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Find Your Next Role</h1>
      <p style={styles.subheader}>Browse open positions from top companies</p>

      <SearchBar initialQuery={q} initialLocation={location} onSearch={handleSearch} />

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>&#128269;</div>
          <div>No jobs found{q && ` for "${q}"`}{location && ` in "${location}"`}</div>
        </div>
      ) : (
        <>
          <div>
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
          <div style={styles.pagination}>
            {page > 1 && (
              <button style={styles.pageBtn(false)} onClick={() => setPage(p => p - 1)}>
                Previous
              </button>
            )}
            <button style={styles.pageBtn(true)}>{page}</button>
            {jobs.length === 10 && (
              <button style={styles.pageBtn(false)} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
