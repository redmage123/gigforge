import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import * as orgsController from './orgs.controller'

const router = Router()

const createOrgSchema = z.object({
  name: z.string().min(1),
})

const inviteMemberSchema = z.object({
  email: z.string().email(),
})

router.post('/', authenticate, validateBody(createOrgSchema), orgsController.create)
router.get('/:orgId', authenticate, orgsController.getById)
router.post('/:orgId/members', authenticate, validateBody(inviteMemberSchema), orgsController.invite)
router.delete('/:orgId/members/:userId', authenticate, orgsController.removeMemberHandler)

export default router
