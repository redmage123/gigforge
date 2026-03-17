import express from 'express'
import { env } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './modules/auth/auth.router'
import documentsRouter from './modules/documents/documents.router'
import chatRouter from './modules/chat/chat.router'
import widgetRouter from './modules/widget/widget.router'

export function createApp() {
  const app = express()

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // CORS
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', env.CORS_ORIGIN)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    next()
  })

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Routes
  app.use('/auth', authRouter)
  app.use('/documents', documentsRouter)
  app.use('/chat', chatRouter)
  app.use('/', widgetRouter)

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
