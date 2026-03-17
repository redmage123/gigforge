import express from 'express'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './modules/auth/auth.router'
import orgsRouter from './modules/organizations/orgs.router'
import usageRouter from './modules/usage/usage.router'
import invoicesRouter from './modules/invoices/invoices.router'
import webhooksRouter from './modules/webhooks/webhooks.router'
import { authenticate } from './middleware/authenticate'
import { z } from 'zod'
import { validateBody } from './middleware/validate'
import { list as listPlans, getForOrg, setForOrg } from './modules/plans/plans.controller'

const app = express()

// JSON body parser (must come before routes, but NOT for webhooks — those use raw)
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Auth routes
app.use('/auth', authRouter)

// Webhooks — raw body parser applied inside webhooksRouter
app.use('/webhooks', webhooksRouter)

// Organization routes
app.use('/orgs', orgsRouter)

// Plan listing (no auth required)
app.get('/plans', listPlans)

// Org-scoped plan routes
const setPlanSchema = z.object({ planId: z.string().min(1) })
app.get('/orgs/:orgId/plan', authenticate, getForOrg)
app.post('/orgs/:orgId/plan', authenticate, validateBody(setPlanSchema), setForOrg)

// Org-scoped usage routes
app.use('/orgs/:orgId/usage', usageRouter)

// Org-scoped invoice routes
app.use('/orgs/:orgId/invoices', invoicesRouter)

// Error handler (must be last)
app.use(errorHandler)

export default app

// Start server if run directly
if (require.main === module) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10)
  app.listen(PORT, () => {
    console.log(`SaaS Billing API listening on port ${PORT}`)
  })
}
