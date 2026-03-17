import express from 'express'
import { authRouter } from './modules/auth/auth.router'
import { todosRouter } from './modules/todos/todos.router'
import { errorHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRouter)
  app.use('/todos', todosRouter)
  app.use(errorHandler)
  return app
}
