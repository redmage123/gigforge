import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { getPool } from '../../config/database'
import { env } from '../../config/env'
import { ConflictError, UnauthorizedError } from '../../types/errors'

export interface RegisterInput {
  email: string
  password: string
  name: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface UserRecord {
  id: string
  email: string
  name: string
  created_at: Date
}

export async function registerUser(input: RegisterInput): Promise<UserRecord> {
  const pool = getPool()

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [input.email])
  if (existing.rows.length > 0) {
    throw new ConflictError('Email already registered')
  }

  const passwordHash = await bcrypt.hash(input.password, 10)
  const id = crypto.randomUUID()

  const result = await pool.query(
    'INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, created_at',
    [id, input.email, input.name, passwordHash]
  )

  return result.rows[0] as UserRecord
}

export async function loginUser(input: LoginInput): Promise<{ user: UserRecord; token: string }> {
  const pool = getPool()

  const result = await pool.query(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
    [input.email]
  )

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const user = result.rows[0] as UserRecord & { password_hash: string }
  const valid = await bcrypt.compare(input.password, user.password_hash)
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password')
  }

  // Fetch org memberships
  const orgsResult = await pool.query(
    'SELECT org_id FROM org_members WHERE user_id = $1',
    [user.id]
  )
  const orgIds = orgsResult.rows.map((r: { org_id: string }) => r.org_id)

  const token = jwt.sign(
    { userId: user.id, email: user.email, orgIds },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  const { password_hash: _ph, ...safeUser } = user
  return { user: safeUser as UserRecord, token }
}
