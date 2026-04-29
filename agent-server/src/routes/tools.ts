import { Router } from 'express'
import { Tool } from '../db/models/Tool.ts'
import { ensureToolRegistrySeeded } from '../agent/orchestration/defaultTools.ts'

const router = Router()

type ToolLean = { id: string; description?: string; enabled: boolean }

router.get('/', async (_req, res) => {
  await ensureToolRegistrySeeded()
  const docs = (await Tool.find().sort({ id: 1 }).lean()) as unknown as ToolLean[]
  return res.json(docs.map((d) => ({ id: d.id, description: d.description ?? '', enabled: d.enabled })))
})

router.patch('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (typeof body.description === 'string') update.description = body.description
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = (await Tool.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true }).lean()) as unknown as ToolLean | null
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json({ id: doc.id, description: doc.description ?? '', enabled: doc.enabled })
})

export default router
