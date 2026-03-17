import { RequestHandler } from 'express'
import { getHttpRequestsCounter } from '../metrics/counters'
import { getRequestDurationHistogram } from '../metrics/histograms'

export function metricsMiddleware(): RequestHandler {
  return (req, res, next) => {
    const start = Date.now()

    res.on('finish', () => {
      const route = req.route?.path ?? req.path
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      }
      const durationSec = (Date.now() - start) / 1000

      getHttpRequestsCounter().inc(labels)
      getRequestDurationHistogram().observe(labels, durationSec)
    })

    next()
  }
}
