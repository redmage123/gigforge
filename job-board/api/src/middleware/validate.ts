import { RequestHandler } from 'express'
import { ZodSchema } from 'zod'

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target])
    if (!result.success) {
      return next(result.error)
    }
    req[target] = result.data
    next()
  }
}
