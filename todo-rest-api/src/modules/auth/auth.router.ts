import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import { register, login, logout } from './auth.controller'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

authRouter.post('/register', validate(registerSchema), register)
authRouter.post('/login', validate(loginSchema), login)
authRouter.post('/logout', authenticate, logout)
