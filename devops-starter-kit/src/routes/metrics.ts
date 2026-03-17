import { Router } from 'express'
import { getRegistry } from '../metrics/registry'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const registry = getRegistry()
    const output = await registry.metrics()
    res.set('Content-Type', registry.contentType)
    res.status(200).send(output)
  } catch (err) {
    res.status(500).json({ error: 'Failed to collect metrics' })
  }
})

export { router as metricsRouter }
