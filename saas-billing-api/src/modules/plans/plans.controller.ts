import { Request, Response, NextFunction } from 'express'
import { listPlans, getOrgPlan, setOrgPlan } from './plans.service'

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plans = listPlans()
    res.status(200).json({ plans })
  } catch (err) {
    next(err)
  }
}

export async function getForOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscription = await getOrgPlan(req.params.orgId)
    res.status(200).json({ subscription })
  } catch (err) {
    next(err)
  }
}

export async function setForOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscription = await setOrgPlan(req.params.orgId, req.body.planId)
    res.status(200).json({ subscription })
  } catch (err) {
    next(err)
  }
}
