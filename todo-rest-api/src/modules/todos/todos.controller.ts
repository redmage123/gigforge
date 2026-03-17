import { Request, Response, NextFunction } from 'express'
import {
  getTodosByUser,
  createTodo,
  getTodoByIdAndUser,
  updateTodo,
  deleteTodo,
} from './todos.service'

export async function listTodos(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const todos = await getTodosByUser(userId)
    res.status(200).json(todos)
  } catch (err) {
    next(err)
  }
}

export async function createTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const { title } = req.body as { title: string }
    const todo = await createTodo(userId, title)
    res.status(201).json(todo)
  } catch (err) {
    next(err)
  }
}

export async function getTodo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const id = parseInt(req.params.id, 10)
    const todo = await getTodoByIdAndUser(id, userId)
    res.status(200).json(todo)
  } catch (err) {
    next(err)
  }
}

export async function updateTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const id = parseInt(req.params.id, 10)
    const updates = req.body as { title?: string; completed?: boolean }
    const todo = await updateTodo(id, userId, updates)
    res.status(200).json(todo)
  } catch (err) {
    next(err)
  }
}

export async function deleteTodoHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id
    const id = parseInt(req.params.id, 10)
    await deleteTodo(id, userId)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
