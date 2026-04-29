import { Router } from 'express'
import { Settings } from '../db/models/Settings.ts'

const router = Router()

const ALLOWED_MODELS = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5'] as const
type AllowedModel = (typeof ALLOWED_MODELS)[number]

function toDto(doc: { defaultModel?: string } | null | undefined): { defaultModel: AllowedModel } {
  const value = (doc?.defaultModel ?? 'claude-sonnet-4') as AllowedModel
  return { defaultModel: value }
}

router.get('/', async (_req, res) => {
  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  return res.json(toDto(doc as { defaultModel?: string }))
})

router.put('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.defaultModel === 'string') {
    if (!ALLOWED_MODELS.includes(body.defaultModel as AllowedModel)) {
      return res.status(400).json({ error: 'invalid_model' })
    }
    update.defaultModel = body.defaultModel
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  return res.json(toDto(doc as { defaultModel?: string }))
})

export default router
