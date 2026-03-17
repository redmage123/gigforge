import { RequestHandler } from 'express'
import { z } from 'zod'
import { registerUser, loginUser } from './auth.service'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['applicant', 'employer']).optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body)
    const result = await registerUser(input)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}

export const login: RequestHandler = async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body)
    const result = await loginUser(input)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

export const logout: RequestHandler = (_req, res) => {
  res.status(200).json({ message: 'Logged out successfully' })
}
