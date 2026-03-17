import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AuthenticationError } from '../types/errors'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number
    email: string
  }
}

interface JwtPayload {
  id: number
  email: string
  iat?: number
  exp?: number
}

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided')
    }

    const token = authHeader.slice(7)
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload

    req.user = { id: payload.id, email: payload.email }
    next()
  } catch (err) {
    if (err instanceof AuthenticationError) {
      next(err)
    } else {
      next(new AuthenticationError('Invalid or expired token'))
    }
  }
}
