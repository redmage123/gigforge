import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getPool } from '../../config/database'
import { env } from '../../config/env'
import { ConflictError, UnauthorizedError } from '../../types/errors'
import type { Role } from '../../types/role'

export interface RegisterInput {
  email: string
  password: string
  name: string
  role?: Role
}

export interface LoginInput {
  email: string
  password: string
}

export async function registerUser(input: RegisterInput) {
  const pool = getPool()
  const { email, password, name, role = 'applicant' } = input

  // Check for existing user
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    throw new ConflictError('Email already registered')
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
    [email, passwordHash, name, role]
  )

  const user = rows[0]
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { user, token }
}

export async function loginUser(input: LoginInput) {
  const pool = getPool()
  const { email, password } = input

  const { rows } = await pool.query(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
    [email]
  )

  if (rows.length === 0) {
    throw new UnauthorizedError('Invalid credentials')
  }

  const user = rows[0]
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  const { password_hash: _, ...safeUser } = user
  return { user: safeUser, token }
}
