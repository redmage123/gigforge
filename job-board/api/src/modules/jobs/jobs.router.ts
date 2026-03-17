import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/requireRole'
import { listJobs, getJob, postJob, putJob, removeJob } from './jobs.controller'

const router = Router()

router.get('/', listJobs)
router.get('/:id', getJob)
router.post('/', authenticate, requireRole('employer', 'admin'), postJob)
router.put('/:id', authenticate, requireRole('employer', 'admin'), putJob)
router.delete('/:id', authenticate, requireRole('employer', 'admin'), removeJob)

export default router
