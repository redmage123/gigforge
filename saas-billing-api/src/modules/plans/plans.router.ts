import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import * as plansController from './plans.controller'

const router = Router()

const setPlanSchema = z.object({
  planId: z.string().min(1),
})

// Global plan listing - no auth required
router.get('/', plansController.list)

// Org-specific plan routes are mounted on the orgs router,
// but we export handlers here for use in app.ts as well
router.get('/orgs/:orgId/plan', authenticate, plansController.getForOrg)
router.post('/orgs/:orgId/plan', authenticate, validateBody(setPlanSchema), plansController.setForOrg)

export default router
