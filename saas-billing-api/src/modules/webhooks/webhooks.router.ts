import { Router } from 'express'
import express from 'express'
import * as webhooksController from './webhooks.controller'

const router = Router()

// Use raw body parser for Stripe HMAC verification
router.post('/stripe', express.raw({ type: 'application/json' }), webhooksController.handleStripe)

export default router
