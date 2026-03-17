import { RequestHandler } from 'express'
import { z } from 'zod'
import { getAllUsers, updateUserRole, adminDeleteJob } from './admin.service'

const updateRoleSchema = z.object({
  role: z.enum(['applicant', 'employer', 'admin'])
})

export const listUsers: RequestHandler = async (_req, res, next) => {
  try {
    const users = await getAllUsers()
    res.json({ users })
  } catch (err) {
    next(err)
  }
}

export const setUserRole: RequestHandler = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10)
    const { role } = updateRoleSchema.parse(req.body)
    const user = await updateUserRole(userId, role)
    res.json(user)
  } catch (err) {
    next(err)
  }
}

export const deleteJob: RequestHandler = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10)
    await adminDeleteJob(jobId)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
