import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'

const router = Router()

router.get('/widget.js', (_req: Request, res: Response) => {
  const widgetPath = path.resolve(__dirname, '../../../widget/chat-widget.js')

  if (!fs.existsSync(widgetPath)) {
    res.status(404).send('// Widget not found')
    return
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.sendFile(widgetPath)
})

export default router
