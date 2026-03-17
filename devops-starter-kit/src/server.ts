import { createApp } from './app'
import { getEnv } from './config/env'

const env = getEnv()
const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Server listening on port ${env.PORT}`,
      port: env.PORT,
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })
  )
})

process.on('SIGTERM', () => {
  console.log(JSON.stringify({ level: 'info', message: 'SIGTERM received, shutting down' }))
  server.close(() => {
    console.log(JSON.stringify({ level: 'info', message: 'Server closed' }))
    process.exit(0)
  })
})

export { server }
