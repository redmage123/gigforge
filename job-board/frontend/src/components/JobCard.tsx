import { Link } from 'react-router'
import type { Job } from '../types'

interface JobCardProps {
  job: Job
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    transition: 'box-shadow 0.2s'
  },
  title: { margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: '#1a1a1a' },
  meta: { margin: '0 0 8px', color: '#666', fontSize: 14 },
  tags: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tag: {
    background: '#f0f4ff',
    color: '#3b5bdb',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500
  },
  badge: {
    background: '#e6f4ea',
    color: '#2d6a4f',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12
  },
  link: { textDecoration: 'none', color: 'inherit' },
  right: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 120 },
  apply: {
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    cursor: 'pointer',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500
  },
  salary: { color: '#555', fontSize: 13 }
}

export function JobCard({ job }: JobCardProps) {
  const posted = new Date(job.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  return (
    <div style={styles.card}>
      <div>
        <Link to={`/jobs/${job.id}`} style={styles.link}>
          <h3 style={styles.title}>{job.title}</h3>
        </Link>
        <p style={styles.meta}>
          {job.employer_name && <span>{job.employer_name} &bull; </span>}
          {job.location && <span>{job.location} &bull; </span>}
          <span>{posted}</span>
        </p>
        <div style={styles.tags}>
          <span style={styles.tag}>{job.job_type}</span>
          {job.status === 'open' && <span style={styles.badge}>Hiring</span>}
        </div>
      </div>
      <div style={styles.right}>
        {job.salary_range && <span style={styles.salary}>{job.salary_range}</span>}
        <Link to={`/jobs/${job.id}`} style={styles.apply}>View Job</Link>
      </div>
    </div>
  )
}
