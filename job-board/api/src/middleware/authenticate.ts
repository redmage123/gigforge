import { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from '../types/errors'
import type { Role } from '../types/role'

interface JwtPayload {
  id: number
  email: string
  role: Role
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization header'))
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    req.user = { id: payload.id, email: payload.email, role: payload.role }
    next()
  } catch {
    next(new UnauthorizedError('Invalid or expired token'))
  }
}
