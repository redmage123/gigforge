import { getPool } from '../../config/database'
import { NotFoundError, ForbiddenError } from '../../types/errors'

export interface CreateJobInput {
  title: string
  description: string
  location?: string
  job_type?: string
  salary_range?: string
}

export interface UpdateJobInput extends Partial<CreateJobInput> {
  status?: 'open' | 'closed' | 'draft'
}

export async function searchJobs(query: string, filters: { location?: string; page?: number }) {
  const pool = getPool()
  const page = filters.page ?? 1
  const limit = 10
  const offset = (page - 1) * limit

  const conditions: string[] = ['j.status = $1']
  const params: unknown[] = ['open']

  if (query) {
    params.push(query)
    conditions.push(`j.search_vector @@ websearch_to_tsquery('english', $${params.length})`)
  }
  if (filters.location) {
    params.push(`%${filters.location}%`)
    conditions.push(`j.location ILIKE $${params.length}`)
  }

  params.push(limit, offset)
  const sql = `SELECT j.*, u.name as employer_name FROM jobs j LEFT JOIN users u ON j.employer_id = u.id WHERE ${conditions.join(' AND ')} ORDER BY j.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function getJobById(id: number) {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT j.*, u.name as employer_name FROM jobs j LEFT JOIN users u ON j.employer_id = u.id WHERE j.id = $1',
    [id]
  )
  if (rows.length === 0) throw new NotFoundError('Job not found')
  return rows[0]
}

export async function createJob(employerId: number, input: CreateJobInput) {
  const pool = getPool()
  const { title, description, location, job_type = 'full-time', salary_range } = input
  const { rows } = await pool.query(
    `INSERT INTO jobs (employer_id, title, description, location, job_type, salary_range)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [employerId, title, description, location ?? null, job_type, salary_range ?? null]
  )
  return rows[0]
}

export async function updateJob(jobId: number, userId: number, role: string, input: UpdateJobInput) {
  const pool = getPool()

  // Fetch job to check ownership
  const { rows: existing } = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId])
  if (existing.length === 0) throw new NotFoundError('Job not found')

  const job = existing[0]
  if (role !== 'admin' && job.employer_id !== userId) {
    throw new NotFoundError('Job not found')
  }

  const fields: string[] = []
  const params: unknown[] = []

  if (input.title !== undefined) { params.push(input.title); fields.push(`title = $${params.length}`) }
  if (input.description !== undefined) { params.push(input.description); fields.push(`description = $${params.length}`) }
  if (input.location !== undefined) { params.push(input.location); fields.push(`location = $${params.length}`) }
  if (input.job_type !== undefined) { params.push(input.job_type); fields.push(`job_type = $${params.length}`) }
  if (input.salary_range !== undefined) { params.push(input.salary_range); fields.push(`salary_range = $${params.length}`) }
  if (input.status !== undefined) { params.push(input.status); fields.push(`status = $${params.length}`) }

  if (fields.length === 0) return job

  params.push(jobId)
  const { rows } = await pool.query(
    `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return rows[0]
}

export async function deleteJob(jobId: number, userId: number, role: string) {
  const pool = getPool()

  const { rows: existing } = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId])
  if (existing.length === 0) throw new NotFoundError('Job not found')

  const job = existing[0]
  if (role !== 'admin' && job.employer_id !== userId) {
    throw new ForbiddenError('You do not own this job')
  }

  await pool.query('DELETE FROM jobs WHERE id = $1', [jobId])
}

export async function getEmployerJobs(employerId: number) {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT * FROM jobs WHERE employer_id = $1 ORDER BY created_at DESC',
    [employerId]
  )
  return rows
}
