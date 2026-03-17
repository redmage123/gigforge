import { Router } from 'express'

interface Item {
  id: number
  name: string
  createdAt: string
}

let items: Item[] = []
let nextId = 1

export function resetStore(): void {
  items = []
  nextId = 1
}

const router = Router()

router.get('/', (_req, res) => {
  res.json(items)
})

router.post('/', (req, res) => {
  const item: Item = {
    id: nextId++,
    name: req.body.name as string,
    createdAt: new Date().toISOString(),
  }
  items.push(item)
  res.status(201).json(item)
})

router.get('/:id', (req, res) => {
  const item = items.find((i) => i.id === Number(req.params.id))
  if (!item) return res.status(404).json({ error: 'Not found' }) as unknown as void
  res.json(item)
})

router.put('/:id', (req, res) => {
  const idx = items.findIndex((i) => i.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' }) as unknown as void
  items[idx] = { ...items[idx]!, name: req.body.name as string }
  res.json(items[idx])
})

router.delete('/:id', (req, res) => {
  const idx = items.findIndex((i) => i.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' }) as unknown as void
  items.splice(idx, 1)
  res.status(204).end()
})

export { router as apiRouter }
