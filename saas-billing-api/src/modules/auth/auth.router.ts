import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import * as authController from './auth.controller'

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/register', validateBody(registerSchema), authController.register)
router.post('/login', validateBody(loginSchema), authController.login)
router.post('/logout', authenticate, authController.logout)

export default router
