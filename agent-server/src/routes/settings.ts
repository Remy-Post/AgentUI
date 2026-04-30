import { Router } from 'express'
import { Settings } from '../db/models/Settings.ts'
import {
  MODEL_CLASSES,
  normalizeModelClass,
  resolveLatestModelId,
  type ModelClass,
} from '../../util/vars.ts'
import type { SettingsDTO } from '../shared/types.ts'

const router = Router()

type SettingsLean = {
  defaultModel?: string
  useOneMillionContext?: boolean
  useFastMode?: boolean
  autoMemoryEnabled?: boolean
  autoMemoryDirectory?: string
  autoDreamEnabled?: boolean
}

function toDto(doc: SettingsLean | null | undefined): SettingsDTO {
  const cls: ModelClass = normalizeModelClass(doc?.defaultModel)
  return {
    defaultModel: cls,
    defaultModelId: resolveLatestModelId(cls),
    useOneMillionContext: Boolean(doc?.useOneMillionContext),
    useFastMode: Boolean(doc?.useFastMode),
    autoMemoryEnabled: doc?.autoMemoryEnabled !== false,
    autoMemoryDirectory: typeof doc?.autoMemoryDirectory === 'string' ? doc.autoMemoryDirectory : '',
    autoDreamEnabled: Boolean(doc?.autoDreamEnabled),
  }
}

router.get('/', async (_req, res) => {
  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  return res.json(toDto(doc as SettingsLean))
})

router.put('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.defaultModel === 'string') {
    if (!(MODEL_CLASSES as readonly string[]).includes(body.defaultModel)) {
      return res.status(400).json({ error: 'invalid_model' })
    }
    update.defaultModel = body.defaultModel
  }
  if (typeof body.useOneMillionContext === 'boolean') {
    update.useOneMillionContext = body.useOneMillionContext
  }
  if (typeof body.useFastMode === 'boolean') {
    update.useFastMode = body.useFastMode
  }
  if (typeof body.autoMemoryEnabled === 'boolean') {
    update.autoMemoryEnabled = body.autoMemoryEnabled
  }
  if (typeof body.autoMemoryDirectory === 'string') {
    update.autoMemoryDirectory = body.autoMemoryDirectory.trim()
  }
  if (typeof body.autoDreamEnabled === 'boolean') {
    update.autoDreamEnabled = body.autoDreamEnabled
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()
  return res.json(toDto(doc as SettingsLean))
})

export default router
