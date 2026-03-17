import express, { Application } from 'express'
import { composeSecurity } from './middleware/security'
import { requestLogger } from './middleware/requestLogger'
import { metricsMiddleware } from './middleware/metricsMiddleware'
import { notFoundHandler, errorHandler } from './middleware/errorHandler'
import { healthRouter } from './routes/health'
import { metricsRouter } from './routes/metrics'
import { apiRouter } from './routes/api'

export function createApp(): Application {
  const app = express()

  // Security middleware
  const securityMiddleware = composeSecurity({
    allowedOrigins: ['*'],
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000,
  })
  securityMiddleware.forEach((mw) => app.use(mw))

  // Request parsing
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Logging
  app.use(requestLogger())

  // Metrics tracking
  app.use(metricsMiddleware())

  // Routes
  app.use('/health', healthRouter)
  app.use('/metrics', metricsRouter)
  app.use('/api/items', apiRouter)

  // Error handling
  app.use(notFoundHandler())
  app.use(errorHandler())

  return app
}
