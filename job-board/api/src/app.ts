import express from 'express'
import authRouter from './modules/auth/auth.router'
import jobsRouter from './modules/jobs/jobs.router'
import applicationsRouter, { jobsApplicationsRouter } from './modules/applications/applications.router'
import adminRouter from './modules/admin/admin.router'
import { errorHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  // Routes
  app.use('/auth', authRouter)
  app.use('/jobs', jobsRouter)
  app.use('/jobs', jobsApplicationsRouter)
  app.use('/applications', applicationsRouter)
  app.use('/admin', adminRouter)

  // Error handler
  app.use(errorHandler)

  return app
}

// Only start server when not in test mode
if (process.env.NODE_ENV !== 'test') {
  const { env } = require('./config/env')
  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`API server running on port ${env.PORT}`)
  })
}
