import type { Role } from './role'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        email: string
        role: Role
      }
    }
  }
}

export {}
