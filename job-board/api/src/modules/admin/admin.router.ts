import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/requireRole'
import { listUsers, setUserRole, deleteJob } from './admin.controller'

const router = Router()

router.use(authenticate, requireRole('admin'))

router.get('/users', listUsers)
router.put('/users/:id/role', setUserRole)
router.delete('/jobs/:id', deleteJob)

export default router
