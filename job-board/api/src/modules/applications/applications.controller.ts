import { RequestHandler } from 'express'
import { z } from 'zod'
import {
  applyToJob,
  getMyApplications,
  getJobApplications,
  updateApplicationStatus
} from './applications.service'

const applySchema = z.object({
  cover_letter: z.string().optional()
})

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'reviewing', 'accepted', 'rejected'])
})

export const apply: RequestHandler = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.jobId, 10)
    const { cover_letter } = applySchema.parse(req.body)
    const application = await applyToJob(req.user!.id, jobId, cover_letter)
    res.status(201).json(application)
  } catch (err) {
    next(err)
  }
}

export const myApplications: RequestHandler = async (req, res, next) => {
  try {
    const applications = await getMyApplications(req.user!.id)
    res.json({ applications })
  } catch (err) {
    next(err)
  }
}

export const jobApplications: RequestHandler = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.jobId, 10)
    const applications = await getJobApplications(jobId, req.user!.id, req.user!.role)
    res.json({ applications })
  } catch (err) {
    next(err)
  }
}

export const patchApplication: RequestHandler = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.jobId, 10)
    const appId = parseInt(req.params.appId, 10)
    const { status } = updateStatusSchema.parse(req.body)
    const application = await updateApplicationStatus(jobId, appId, req.user!.id, req.user!.role, status)
    res.json(application)
  } catch (err) {
    next(err)
  }
}
