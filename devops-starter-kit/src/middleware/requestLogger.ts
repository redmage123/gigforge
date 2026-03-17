import { RequestHandler } from 'express'

export interface LogEntry {
  timestamp: string
  method: string
  url: string
  statusCode: number
  durationMs: number
  userAgent?: string
  ip?: string
}

export function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const start = Date.now()

    res.on('finish', () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      }

      if (process.env.NODE_ENV !== 'test') {
        process.stdout.write(JSON.stringify(entry) + '\n')
      }
    })

    next()
  }
}
