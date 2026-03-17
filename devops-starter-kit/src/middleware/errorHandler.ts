import { ErrorRequestHandler, RequestHandler } from 'express'

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl })
  }
}

export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const status = (err as { status?: number }).status ?? 500
    const message =
      process.env.NODE_ENV === 'production' && status === 500
        ? 'Internal Server Error'
        : (err as Error).message

    if (process.env.NODE_ENV !== 'test') {
      console.error(err)
    }

    res.status(status).json({ error: message })
  }
}
