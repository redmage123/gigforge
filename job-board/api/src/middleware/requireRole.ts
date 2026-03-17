import { RequestHandler } from 'express'
import { ForbiddenError, UnauthorizedError } from '../types/errors'
import type { Role } from '../types/role'

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError())
    if (!roles.includes(req.user.role)) return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`))
    next()
  }
}
