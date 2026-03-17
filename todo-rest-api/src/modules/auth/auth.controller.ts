import { Request, Response, NextFunction } from 'express'
import { getPool } from '../../config/database'
import {
  hashPassword,
  comparePassword,
  signToken,
  blacklistToken,
} from './auth.service'
import {
  ConflictError,
  UnauthorizedError,
} from '../../types/errors'

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, name } = req.body as {
      email: string
      password: string
      name: string
    }

    const pool = getPool()

    // Check for existing user
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )
    if (existing.rows.length > 0) {
      throw new ConflictError('Email already registered')
    }

    const passwordHash = await hashPassword(password)

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, passwordHash, name]
    )

    const user = result.rows[0] as {
      id: number
      email: string
      name: string
      created_at: string
    }
    const token = signToken({ id: user.id, email: user.email })

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string }

    const pool = getPool()
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const user = result.rows[0] as {
      id: number
      email: string
      name: string
      password_hash: string
    }

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const token = signToken({ id: user.id, email: user.email })

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authorization token provided')
    }

    const token = authHeader.slice(7)
    await blacklistToken(token)

    res.status(200).json({ message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
}
