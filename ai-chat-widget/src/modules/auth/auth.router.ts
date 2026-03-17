import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import { registerHandler, loginHandler, logoutHandler } from './auth.controller'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

router.post('/register', validateBody(registerSchema), registerHandler)
router.post('/login', validateBody(loginSchema), loginHandler)
router.post('/logout', authenticate, logoutHandler)

export default router
