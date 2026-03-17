import { getPool } from '../../config/database'
import { NotFoundError } from '../../types/errors'
import type { Role } from '../../types/role'

export async function getAllUsers() {
  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
  )
  return rows
}

export async function updateUserRole(userId: number, role: Role) {
  const pool = getPool()
  const { rows } = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role',
    [role, userId]
  )
  if (rows.length === 0) throw new NotFoundError('User not found')
  return rows[0]
}

export async function adminDeleteJob(jobId: number) {
  const pool = getPool()
  const { rows } = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId])
  if (rows.length === 0) throw new NotFoundError('Job not found')
  await pool.query('DELETE FROM jobs WHERE id = $1', [jobId])
}
