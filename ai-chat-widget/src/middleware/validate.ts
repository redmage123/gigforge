import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { ValidationError } from '../types/errors'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Validation failed', err.flatten().fieldErrors))
      } else {
        next(err)
      }
    }
  }
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Record<string, string>
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Invalid parameters', err.flatten().fieldErrors))
      } else {
        next(err)
      }
    }
  }
}
