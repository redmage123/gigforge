'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

interface Todo {
  id: number
  title: string
  completed: boolean
  userId: number
}

interface LogEntry {
  method: string
  path: string
  status: number
  body?: string
  response: string
  ts: string
}

let nextId = 4

const initialTodos: Todo[] = [
  { id: 1, title: 'Write tests first (TDD)', completed: true, userId: 1 },
  { id: 2, title: 'Ship to production', completed: false, userId: 1 },
  { id: 3, title: 'Add monitoring', completed: false, userId: 1 },
]

function methodBadge(method: string) {
  const colors: Record<string, string> = {
    POST: 'bg-green-700 text-green-100',
    GET: 'bg-blue-700 text-blue-100',
    PATCH: 'bg-yellow-700 text-yellow-100',
    DELETE: 'bg-red-700 text-red-100',
  }
  return colors[method] ?? 'bg-bg-tertiary text-text-secondary'
}

function statusColor(s: number) {
  if (s >= 200 && s < 300) return 'text-green-400'
  if (s >= 400) return 'text-red-400'
  return 'text-text-secondary'
}

export default function TodoApiDemo() {
  const [authed, setAuthed] = useState(false)
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('alice')
  const [password, setPassword] = useState('secret')
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [newTitle, setNewTitle] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function addLog(entry: LogEntry) {
    setLog((prev) => [entry, ...prev].slice(0, 20))
  }

  async function simulate(ms = 400) {
    setLoading(true)
    await new Promise((r) => setTimeout(r, ms))
    setLoading(false)
  }

  async function handleLogin() {
    await simulate(600)
    if (password.length < 4) {
      addLog({ method: 'POST', path: '/auth/login', status: 401, body: JSON.stringify({ username, password }), response: '{"error":"Invalid credentials"}', ts: new Date().toISOString() })
      return
    }
    const fakeToken = btoa(`${username}:${Date.now()}`).slice(0, 32)
    setToken(fakeToken)
    setAuthed(true)
    addLog({ method: 'POST', path: '/auth/login', status: 200, body: JSON.stringify({ username, password }), response: `{"token":"${fakeToken}","expiresIn":3600}`, ts: new Date().toISOString() })
  }

  async function handleLogout() {
    await simulate(300)
    addLog({ method: 'POST', path: '/auth/logout', status: 200, response: '{"message":"Token invalidated"}', ts: new Date().toISOString() })
    setAuthed(false)
    setToken('')
    setTodos(initialTodos)
  }

  async function handleAddTodo() {
    if (!newTitle.trim()) return
    await simulate()
    const todo: Todo = { id: nextId++, title: newTitle.trim(), completed: false, userId: 1 }
    setTodos((prev) => [...prev, todo])
    addLog({ method: 'POST', path: '/todos', status: 201, body: JSON.stringify({ title: todo.title }), response: JSON.stringify(todo), ts: new Date().toISOString() })
    setNewTitle('')
  }

  async function handleToggle(todo: Todo) {
    await simulate(300)
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, completed: !t.completed } : t))
    addLog({ method: 'PATCH', path: `/todos/${todo.id}`, status: 200, body: JSON.stringify({ completed: !todo.completed }), response: JSON.stringify({ ...todo, completed: !todo.completed }), ts: new Date().toISOString() })
  }

  async function handleDelete(todo: Todo) {
    await simulate(300)
    setTodos((prev) => prev.filter((t) => t.id !== todo.id))
    addLog({ method: 'DELETE', path: `/todos/${todo.id}`, status: 204, response: '', ts: new Date().toISOString() })
  }

  async function handleUnauthorized() {
    await simulate(300)
    addLog({ method: 'GET', path: '/todos', status: 401, response: '{"error":"No token provided"}', ts: new Date().toISOString() })
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/demos" className="text-accent hover:underline mb-6 inline-block text-sm">
        ← All Demos
      </Link>

      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">🔐</span>
        <h1 className="text-3xl font-bold text-text-primary">Todo REST API</h1>
      </div>
      <p className="text-text-secondary mb-10">JWT auth + CRUD with ownership guards. Try logging in, managing todos, and watching the request log.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Auth + Todos */}
        <div className="space-y-4">
          {/* Auth Panel */}
          <div className="bg-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              Authentication
              {authed && <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full">Authenticated</span>}
            </h2>

            {!authed ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Username</label>
                  <input
                    className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alice"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Password</label>
                  <input
                    type="password"
                    className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="min 4 chars"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="flex-1 bg-accent hover:bg-blue-600 text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'POST /auth/login'}
                  </button>
                  <button
                    onClick={handleUnauthorized}
                    disabled={loading}
                    className="flex-1 bg-bg-tertiary hover:bg-slate-600 text-text-secondary px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    Try without token
                  </button>
                </div>
                <p className="text-xs text-text-muted">Tip: use password shorter than 4 chars to see a 401.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-bg-primary rounded-lg p-3 font-mono text-xs text-green-400 break-all">
                  Bearer {token}
                </div>
                <p className="text-xs text-text-muted">Token is blacklisted on logout — replay attacks blocked.</p>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  className="bg-bg-tertiary hover:bg-slate-600 text-text-secondary px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  POST /auth/logout
                </button>
              </div>
            )}
          </div>

          {/* Todos Panel */}
          <div className="bg-bg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Todos {authed && <span className="text-text-muted text-sm font-normal">— {todos.length} items</span>}
            </h2>

            {!authed ? (
              <p className="text-text-muted text-sm">Login to manage todos.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="New todo title…"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                  />
                  <button
                    onClick={handleAddTodo}
                    disabled={loading || !newTitle.trim()}
                    className="bg-accent hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <ul className="space-y-2">
                  {todos.map((todo) => (
                    <li key={todo.id} className="flex items-center gap-3 bg-bg-primary rounded-lg px-3 py-2">
                      <button
                        onClick={() => handleToggle(todo)}
                        disabled={loading}
                        className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${todo.completed ? 'bg-accent border-accent text-white' : 'border-bg-tertiary hover:border-accent'}`}
                      >
                        {todo.completed && '✓'}
                      </button>
                      <span className={`flex-1 text-sm ${todo.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                        {todo.title}
                      </span>
                      <span className="text-xs text-text-muted font-mono">id:{todo.id}</span>
                      <button
                        onClick={() => handleDelete(todo)}
                        disabled={loading}
                        className="text-text-muted hover:text-red-400 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right: Request Log */}
        <div className="bg-bg-secondary rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            Request Log
            {loading && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
          </h2>
          <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto max-h-[480px]">
            {log.length === 0 ? (
              <p className="text-text-muted text-sm">No requests yet — try logging in.</p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="bg-bg-primary rounded-lg p-3 font-mono text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${methodBadge(entry.method)}`}>{entry.method}</span>
                    <span className="text-text-secondary">{entry.path}</span>
                    <span className={`ml-auto font-bold ${statusColor(entry.status)}`}>{entry.status}</span>
                  </div>
                  {entry.body && (
                    <div className="text-text-muted pl-2 border-l border-bg-tertiary">
                      ↑ {entry.body}
                    </div>
                  )}
                  {entry.response && (
                    <div className="text-green-400 pl-2 border-l border-bg-tertiary break-all">
                      ↓ {entry.response}
                    </div>
                  )}
                  <div className="text-text-muted text-[10px]">{entry.ts}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Stats footer */}
      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-2xl font-bold text-text-primary">29</div>
          <div className="text-xs text-text-secondary">Automated tests</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-2xl font-bold text-text-primary">100%</div>
          <div className="text-xs text-text-secondary">Pass rate</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4">
          <div className="text-2xl font-bold text-text-primary">JWT</div>
          <div className="text-xs text-text-secondary">Auth + blacklist</div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/portfolio/todo-rest-api" className="text-accent hover:underline text-sm mr-6">View case study →</Link>
        <Link href="/contact" className="inline-block bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">Build something similar</Link>
      </div>
    </div>
  )
}
