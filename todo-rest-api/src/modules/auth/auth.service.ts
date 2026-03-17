import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import { getPool } from '../../config/database'
import { env } from '../../config/env'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS)
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: { id: number; email: string }): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] }
  return jwt.sign(payload, env.JWT_SECRET, options)
}

export async function blacklistToken(token: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    'INSERT INTO token_blacklist (token) VALUES ($1) ON CONFLICT DO NOTHING',
    [token]
  )
}

export async function isBlacklisted(token: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT id FROM token_blacklist WHERE token = $1',
    [token]
  )
  return result.rows.length > 0
}
