import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import * as invoicesController from './invoices.controller'

const router = Router({ mergeParams: true })

router.get('/', authenticate, invoicesController.list)
router.get('/:invoiceId', authenticate, invoicesController.getById)
router.post('/generate', authenticate, invoicesController.generate)

export default router
