import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { validateBody } from '../../middleware/validate'
import { chatHandler } from './chat.controller'

const router = Router()

const chatSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(2000, 'Query must be 2000 characters or fewer'),
})

router.use(authenticate)
router.post('/', validateBody(chatSchema), chatHandler)

export default router
