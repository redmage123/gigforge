import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../../middleware/authenticate'
import { chat } from './chat.service'

export async function chatHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { query } = req.body as { query: string }
    const result = await chat(req.user!.id, query)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}
