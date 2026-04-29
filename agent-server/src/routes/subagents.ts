import { Router } from 'express'
import mongoose from 'mongoose'
import { Subagent } from '../db/models/Subagent.ts'
import { writeSubagentFile, removeSubagentFile } from '../agent/scaffold.ts'

const router = Router()

router.get('/', async (_req, res) => {
  const docs = await Subagent.find().sort({ name: 1 }).lean()
  res.json(docs)
})

router.post('/', async (req, res) => {
  try {
    const doc = await Subagent.create(req.body)
    if (doc.enabled) await writeSubagentFile(doc)
    return res.status(201).json(doc)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed'
    return res.status(400).json({ error: message })
  }
})

// PUT performs a full replace; for partial updates use PATCH below.
router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const previous = await Subagent.findById(req.params.id)
  if (!previous) return res.status(404).json({ error: 'not_found' })
  const updated = await Subagent.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!updated) return res.status(404).json({ error: 'not_found' })

  if (previous.name !== updated.name) {
    await removeSubagentFile(previous.name)
  }
  if (updated.enabled) {
    await writeSubagentFile(updated)
  } else {
    await removeSubagentFile(updated.name)
  }
  return res.json(updated)
})

const SUBAGENT_PATCH_FIELDS = ['name', 'description', 'prompt', 'model', 'effort', 'permissionMode', 'tools', 'enabled'] as const

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const previous = await Subagent.findById(req.params.id)
  if (!previous) return res.status(404).json({ error: 'not_found' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const field of SUBAGENT_PATCH_FIELDS) {
    if (field in body) update[field] = body[field]
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const updated = await Subagent.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
  if (!updated) return res.status(404).json({ error: 'not_found' })

  if (previous.name !== updated.name) {
    await removeSubagentFile(previous.name)
  }
  if (updated.enabled) {
    await writeSubagentFile(updated)
  } else {
    await removeSubagentFile(updated.name)
  }
  return res.json(updated)
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Subagent.findByIdAndDelete(req.params.id)
  if (!doc) return res.status(404).json({ error: 'not_found' })
  await removeSubagentFile(doc.name)
  return res.status(204).end()
})

export default router
