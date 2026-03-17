import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getPool } from '../config/database'
import { env } from '../config/env'
import { UnauthorizedError } from '../types/errors'

interface JwtPayload {
  id: number
  email: string
  iat?: number
  exp?: number
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authorization token provided')
    }

    const token = authHeader.slice(7)

    // Verify JWT
    let payload: JwtPayload
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired token')
    }

    // Check blacklist
    const pool = getPool()
    const result = await pool.query(
      'SELECT id FROM token_blacklist WHERE token = $1',
      [token]
    )

    if (result.rows.length > 0) {
      throw new UnauthorizedError('Token has been revoked')
    }

    req.user = { id: payload.id, email: payload.email }
    next()
  } catch (err) {
    next(err)
  }
}
