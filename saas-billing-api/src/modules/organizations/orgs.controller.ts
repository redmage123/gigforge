import { Request, Response, NextFunction } from 'express'
import { createOrg, getOrg, inviteMember, removeMember } from './orgs.service'

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const org = await createOrg(req.body.name, req.user!.userId)
    res.status(201).json({ org })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const org = await getOrg(req.params.orgId, req.user!.userId)
    res.status(200).json({ org })
  } catch (err) {
    next(err)
  }
}

export async function invite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await inviteMember(req.params.orgId, req.body.email, req.user!.userId)
    res.status(201).json({ member })
  } catch (err) {
    next(err)
  }
}

export async function removeMemberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeMember(req.params.orgId, req.params.userId, req.user!.userId)
    res.status(200).json({ message: 'Member removed successfully' })
  } catch (err) {
    next(err)
  }
}
