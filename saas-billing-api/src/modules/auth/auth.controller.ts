import { Request, Response, NextFunction } from 'express'
import { registerUser, loginUser } from './auth.service'

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await registerUser(req.body)
    res.status(201).json({ user })
  } catch (err) {
    next(err)
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, token } = await loginUser(req.body)
    res.status(200).json({ user, token })
  } catch (err) {
    next(err)
  }
}

export async function logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // JWT is stateless; client should discard the token.
    // In a production system, you'd add to a token blacklist / revoke refresh token.
    res.status(200).json({ message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
}
