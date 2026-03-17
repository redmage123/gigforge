import { Request, Response, NextFunction } from 'express'
import { AppError } from '../types/errors'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode,
      },
    })
    return
  }

  // Unexpected errors
  console.error('Unexpected error:', err)
  res.status(500).json({
    error: {
      message: 'Internal server error',
      status: 500,
    },
  })
}
