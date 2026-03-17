import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { validateBody } from '../../middleware/validate'
import {
  createDocumentHandler,
  listDocumentsHandler,
  getDocumentHandler,
  deleteDocumentHandler,
} from './documents.controller'

const router = Router()

const createDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  content: z.string().min(1, 'Content is required'),
})

router.use(authenticate)

router.post('/', validateBody(createDocumentSchema), createDocumentHandler)
router.get('/', listDocumentsHandler)
router.get('/:id', getDocumentHandler)
router.delete('/:id', deleteDocumentHandler)

export default router
