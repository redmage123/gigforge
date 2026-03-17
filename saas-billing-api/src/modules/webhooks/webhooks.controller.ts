import { Request, Response, NextFunction } from 'express'
import { verifyAndDispatch } from './webhooks.service'
import { env } from '../../config/env'
import { BadRequestError } from '../../types/errors'

export async function handleStripe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signature = req.headers['stripe-signature']
    if (!signature || typeof signature !== 'string') {
      throw new BadRequestError('Missing stripe-signature header')
    }

    const result = await verifyAndDispatch(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}
