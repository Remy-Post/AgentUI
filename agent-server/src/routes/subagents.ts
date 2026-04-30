import { Router } from 'express'
import type { Response } from 'express'
import mongoose from 'mongoose'
import { Subagent, type SubagentDoc } from '../db/models/Subagent.ts'
import { writeSubagentFile, removeSubagentFile } from '../agent/scaffold.ts'
import type { SubagentMemoryScope } from '../shared/types.ts'

const router = Router()

const SUBAGENT_MEMORY_SCOPES: readonly SubagentMemoryScope[] = ['user', 'project', 'local', 'none']

export function isValidSubagentMemoryScope(value: unknown): value is SubagentMemoryScope {
  return SUBAGENT_MEMORY_SCOPES.includes(value as SubagentMemoryScope)
}

export function validateSubagentMemoryUpdate(body: Record<string, unknown>): string | null {
  if ('memory' in body && !isValidSubagentMemoryScope(body.memory)) return 'invalid_memory_scope'
  return null
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function sendUpdateError(res: Response, error: unknown): void {
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'update_failed'
  res.status(500).json({ error: message })
}

async function syncSubagentFile(previousName: string, updated: SubagentDoc): Promise<void> {
  if (previousName !== updated.name) {
    await removeSubagentFile(previousName)
  }
  if (updated.enabled) {
    await writeSubagentFile(updated)
  } else {
    await removeSubagentFile(updated.name)
  }
}

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
  const body = bodyRecord(req.body)
  const memoryError = validateSubagentMemoryUpdate(body)
  if (memoryError) return res.status(400).json({ error: memoryError })

  const previous = await Subagent.findById(req.params.id)
  if (!previous) return res.status(404).json({ error: 'not_found' })
  let updated
  try {
    updated = await Subagent.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
  } catch (error) {
    return sendUpdateError(res, error)
  }
  if (!updated) return res.status(404).json({ error: 'not_found' })

  await syncSubagentFile(previous.name, updated)
  return res.json(updated)
})

const SUBAGENT_PATCH_FIELDS = [
  'name',
  'description',
  'prompt',
  'model',
  'effort',
  'permissionMode',
  'tools',
  'disallowedTools',
  'mcpServices',
  'memory',
  'enabled',
] as const

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const previous = await Subagent.findById(req.params.id)
  if (!previous) return res.status(404).json({ error: 'not_found' })

  const body = bodyRecord(req.body)
  const update: Record<string, unknown> = {}
  for (const field of SUBAGENT_PATCH_FIELDS) {
    if (field in body) update[field] = body[field]
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })
  const memoryError = validateSubagentMemoryUpdate(update)
  if (memoryError) return res.status(400).json({ error: memoryError })

  let updated
  try {
    updated = await Subagent.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true })
  } catch (error) {
    return sendUpdateError(res, error)
  }
  if (!updated) return res.status(404).json({ error: 'not_found' })

  await syncSubagentFile(previous.name, updated)
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
