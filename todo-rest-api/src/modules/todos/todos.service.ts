import { getPool } from '../../config/database'
import { NotFoundError } from '../../types/errors'

export interface Todo {
  id: number
  user_id: number
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

export async function getTodosByUser(userId: number): Promise<Todo[]> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT id, user_id, title, completed, created_at, updated_at FROM todos WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  )
  return result.rows as Todo[]
}

export async function createTodo(
  userId: number,
  title: string
): Promise<Todo> {
  const pool = getPool()
  const result = await pool.query(
    'INSERT INTO todos (user_id, title) VALUES ($1, $2) RETURNING id, user_id, title, completed, created_at, updated_at',
    [userId, title]
  )
  return result.rows[0] as Todo
}

export async function getTodoByIdAndUser(
  id: number,
  userId: number
): Promise<Todo> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT id, user_id, title, completed, created_at, updated_at FROM todos WHERE id = $1 AND user_id = $2',
    [id, userId]
  )

  if (result.rows.length === 0) {
    throw new NotFoundError('Todo not found')
  }

  return result.rows[0] as Todo
}

export async function updateTodo(
  id: number,
  userId: number,
  updates: { title?: string; completed?: boolean }
): Promise<Todo> {
  const pool = getPool()

  // First check ownership
  const existing = await pool.query(
    'SELECT id FROM todos WHERE id = $1 AND user_id = $2',
    [id, userId]
  )

  if (existing.rows.length === 0) {
    throw new NotFoundError('Todo not found')
  }

  const fields: string[] = []
  const values: (string | boolean | number)[] = []
  let paramIndex = 1

  if (updates.title !== undefined) {
    fields.push(`title = $${paramIndex++}`)
    values.push(updates.title)
  }

  if (updates.completed !== undefined) {
    fields.push(`completed = $${paramIndex++}`)
    values.push(updates.completed)
  }

  if (fields.length === 0) {
    // No updates, return current state
    const result = await pool.query(
      'SELECT id, user_id, title, completed, created_at, updated_at FROM todos WHERE id = $1',
      [id]
    )
    return result.rows[0] as Todo
  }

  fields.push(`updated_at = NOW()`)
  values.push(id)
  values.push(userId)

  const result = await pool.query(
    `UPDATE todos SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING id, user_id, title, completed, created_at, updated_at`,
    values
  )

  return result.rows[0] as Todo
}

export async function deleteTodo(id: number, userId: number): Promise<void> {
  const pool = getPool()
  const result = await pool.query(
    'DELETE FROM todos WHERE id = $1 AND user_id = $2',
    [id, userId]
  )

  if (result.rowCount === 0) {
    throw new NotFoundError('Todo not found')
  }
}
