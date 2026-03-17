import { Request, Response, NextFunction } from 'express'
import { AppError, ValidationError } from '../types/errors'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    })
    return
  }

  // Unknown / programming errors
  console.error('Unexpected error:', err)
  res.status(500).json({
    error: 'Internal server error',
  })
}
