import { Request, Response, NextFunction } from 'express'
import { register, login, logout } from './auth.service'
import { AuthenticatedRequest } from '../../middleware/authenticate'

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string }
    const result = await register(email, password)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string }
    const result = await login(email, password)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

export async function logoutHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await logout(req.user!.id)
    res.status(200).json({ message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
}
