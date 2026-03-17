import { getPool } from '../../config/database'
import { ConflictError, ForbiddenError, NotFoundError } from '../../types/errors'

export async function applyToJob(applicantId: number, jobId: number, coverLetter?: string) {
  const pool = getPool()

  // Check job exists and is open
  const { rows: jobRows } = await pool.query('SELECT * FROM jobs WHERE id = $1 AND status = $2', [jobId, 'open'])
  if (jobRows.length === 0) throw new NotFoundError('Job not found or not accepting applications')

  // Check for duplicate application
  const { rows: existing } = await pool.query(
    'SELECT id FROM applications WHERE applicant_id = $1 AND job_id = $2',
    [applicantId, jobId]
  )
  if (existing.length > 0) throw new ConflictError('Already applied to this job')

  const { rows } = await pool.query(
    `INSERT INTO applications (applicant_id, job_id, cover_letter)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [applicantId, jobId, coverLetter ?? null]
  )
  return rows[0]
}

export async function getMyApplications(applicantId: number) {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT a.*, j.title as job_title, j.location, j.job_type
     FROM applications a
     JOIN jobs j ON a.job_id = j.id
     WHERE a.applicant_id = $1
     ORDER BY a.created_at DESC`,
    [applicantId]
  )
  return rows
}

export async function getJobApplications(jobId: number, userId: number, role: string) {
  const pool = getPool()

  if (role !== 'admin') {
    // Verify employer owns the job
    const { rows: jobRows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId])
    if (jobRows.length === 0) throw new NotFoundError('Job not found')
    if (jobRows[0].employer_id !== userId) throw new ForbiddenError('You do not own this job')
  }

  const { rows } = await pool.query(
    `SELECT a.*, u.name as applicant_name, u.email as applicant_email
     FROM applications a
     JOIN users u ON a.applicant_id = u.id
     WHERE a.job_id = $1
     ORDER BY a.created_at DESC`,
    [jobId]
  )
  return rows
}

export async function updateApplicationStatus(
  jobId: number,
  appId: number,
  userId: number,
  role: string,
  status: string
) {
  const pool = getPool()

  if (role !== 'admin') {
    const { rows: jobRows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId])
    if (jobRows.length === 0) throw new NotFoundError('Job not found')
    if (jobRows[0].employer_id !== userId) throw new ForbiddenError('You do not own this job')
  }

  const { rows } = await pool.query(
    'UPDATE applications SET status = $1 WHERE id = $2 AND job_id = $3 RETURNING *',
    [status, appId, jobId]
  )
  if (rows.length === 0) throw new NotFoundError('Application not found')
  return rows[0]
}
