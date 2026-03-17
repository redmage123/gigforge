import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import * as usageController from './usage.controller'

const router = Router({ mergeParams: true })

const recordUsageSchema = z.object({
  eventType: z.string().min(1),
  count: z.number().int().positive().optional(),
})

router.post('/', authenticate, validateBody(recordUsageSchema), usageController.record)
router.get('/', authenticate, usageController.getSummary)

export default router
