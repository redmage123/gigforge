import { RequestHandler } from 'express'
import { z } from 'zod'
import { searchJobs, getJobById, createJob, updateJob, deleteJob } from './jobs.service'

const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  job_type: z.enum(['full-time', 'part-time', 'contract', 'remote']).optional(),
  salary_range: z.string().optional()
})

const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(['open', 'closed', 'draft']).optional()
})

export const listJobs: RequestHandler = async (req, res, next) => {
  try {
    const q = (req.query.q as string) ?? ''
    const location = req.query.location as string | undefined
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1
    const jobs = await searchJobs(q, { location, page })
    res.json({ jobs, page })
  } catch (err) {
    next(err)
  }
}

export const getJob: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const job = await getJobById(id)
    res.json(job)
  } catch (err) {
    next(err)
  }
}

export const postJob: RequestHandler = async (req, res, next) => {
  try {
    const input = createJobSchema.parse(req.body)
    const job = await createJob(req.user!.id, input)
    res.status(201).json(job)
  } catch (err) {
    next(err)
  }
}

export const putJob: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const input = updateJobSchema.parse(req.body)
    const job = await updateJob(id, req.user!.id, req.user!.role, input)
    res.json(job)
  } catch (err) {
    next(err)
  }
}

export const removeJob: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    await deleteJob(id, req.user!.id, req.user!.role)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
