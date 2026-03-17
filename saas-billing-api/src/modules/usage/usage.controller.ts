import { Request, Response, NextFunction } from 'express'
import { recordUsage, getUsageSummary } from './usage.service'

export async function record(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await recordUsage(
      req.params.orgId,
      req.user!.userId,
      req.body.eventType,
      req.body.count ?? 1
    )
    res.status(201).json({ event })
  } catch (err) {
    next(err)
  }
}

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getUsageSummary(req.params.orgId, req.user!.userId)
    res.status(200).json({ summary })
  } catch (err) {
    next(err)
  }
}
