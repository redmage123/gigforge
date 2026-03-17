import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { RequestHandler } from 'express'

export function createHelmet(): RequestHandler {
  return helmet() as RequestHandler
}

export function createCors(allowedOrigins: string[]): RequestHandler {
  return cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return cb(null, true)
      }
      cb(new Error('Not allowed by CORS'))
    },
    optionsSuccessStatus: 204,
  })
}

export function createRateLimit(windowMs: number, max: number): RequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  })
}

export interface SecurityOptions {
  allowedOrigins?: string[]
  rateLimitWindowMs?: number
  rateLimitMax?: number
}

export function composeSecurity(options: SecurityOptions = {}): RequestHandler[] {
  return [
    createHelmet(),
    createCors(options.allowedOrigins ?? ['*']),
    createRateLimit(options.rateLimitWindowMs ?? 60000, options.rateLimitMax ?? 100),
  ]
}
