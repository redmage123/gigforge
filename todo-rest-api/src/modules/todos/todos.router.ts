import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/authenticate'
import {
  listTodos,
  createTodoHandler,
  getTodo,
  updateTodoHandler,
  deleteTodoHandler,
} from './todos.controller'

export const todosRouter = Router()

const createTodoSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .min(1, 'Title is required')
    .max(255, 'Title must not exceed 255 characters'),
})

const updateTodoSchema = z
  .object({
    title: z.string().max(255, 'Title must not exceed 255 characters').optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.completed !== undefined,
    { message: 'At least one field (title or completed) must be provided' }
  )

todosRouter.use(authenticate)

todosRouter.get('/', listTodos)
todosRouter.post('/', validate(createTodoSchema), createTodoHandler)
todosRouter.get('/:id', getTodo)
todosRouter.put('/:id', validate(updateTodoSchema), updateTodoHandler)
todosRouter.delete('/:id', deleteTodoHandler)
