import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/requireRole'
import { apply, myApplications, jobApplications, patchApplication } from './applications.controller'

const router = Router({ mergeParams: true })

// GET /applications/mine
router.get('/mine', authenticate, requireRole('applicant'), myApplications)

export default router

// These are mounted on jobs router
export const jobsApplicationsRouter = Router({ mergeParams: true })

jobsApplicationsRouter.post('/:jobId/apply', authenticate, requireRole('applicant'), apply)
jobsApplicationsRouter.get('/:jobId/applications', authenticate, requireRole('employer', 'admin'), jobApplications)
jobsApplicationsRouter.patch('/:jobId/applications/:appId', authenticate, requireRole('employer', 'admin'), patchApplication)
