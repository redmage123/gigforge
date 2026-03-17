import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getPool } from '../../config/database'
import { env } from '../../config/env'
import { AuthenticationError, ConflictError } from '../../types/errors'

export interface User {
  id: number
  email: string
  created_at: Date
}

export interface AuthTokens {
  token: string
  user: Omit<User, 'created_at'>
}

export async function register(email: string, password: string): Promise<AuthTokens> {
  const pool = getPool()

  // Check if user already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    throw new ConflictError('Email already registered')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, passwordHash]
  )

  const user = rows[0] as { id: number; email: string }
  const token = jwt.sign(
    { id: user.id, email: user.email },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { token, user: { id: user.id, email: user.email } }
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const pool = getPool()

  const { rows } = await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  )

  if (rows.length === 0) {
    throw new AuthenticationError('Invalid email or password')
  }

  const user = rows[0] as { id: number; email: string; password_hash: string }
  const valid = await bcrypt.compare(password, user.password_hash)

  if (!valid) {
    throw new AuthenticationError('Invalid email or password')
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { token, user: { id: user.id, email: user.email } }
}

export async function logout(_userId: number): Promise<void> {
  // Stateless JWT — client discards token.
  // For production: maintain a token denylist in Redis.
  return
}
