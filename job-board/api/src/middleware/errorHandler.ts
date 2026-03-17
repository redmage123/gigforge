import { ErrorRequestHandler } from 'express'
import { AppError } from '../types/errors'
import { ZodError } from 'zod'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message })
    return
  }

  // PostgreSQL unique violation
  if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
    res.status(409).json({ error: 'Resource already exists' })
    return
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
