import { Router } from 'express'
import { Tool } from '../db/models/Tool.ts'
import { ensureToolRegistrySeeded, isLockedTool, toolCatalogEntry } from '../agent/orchestration/defaultTools.ts'

const router = Router()

type ToolLean = {
  id: string
  label?: string
  description?: string
  enabled: boolean
  category?: string
  kind?: 'sdk' | 'mcp' | 'compatibility'
  order?: number
  quickRank?: number
  locked?: boolean
  permission?: string
}

function toToolDTO(doc: ToolLean): ToolLean {
  const catalog = toolCatalogEntry(doc.id)
  return {
    id: doc.id,
    label: doc.label || catalog?.label,
    description: doc.description || catalog?.description || '',
    enabled: doc.enabled,
    category: doc.category || catalog?.category,
    kind: doc.kind || catalog?.kind,
    order: typeof doc.order === 'number' ? doc.order : catalog?.order,
    quickRank: typeof doc.quickRank === 'number' ? doc.quickRank : catalog?.quickRank,
    locked: doc.locked === true || catalog?.locked === true,
    permission: doc.permission || catalog?.permission,
  }
}

router.get('/', async (_req, res) => {
  await ensureToolRegistrySeeded()
  const docs = (await Tool.find().sort({ order: 1, id: 1 }).lean()) as unknown as ToolLean[]
  return res.json(docs.map(toToolDTO))
})

router.patch('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') {
    if (body.enabled === false && isLockedTool(req.params.id)) {
      return res.status(400).json({ error: 'locked_tool' })
    }
    update.enabled = body.enabled
  }
  if (typeof body.description === 'string') update.description = body.description
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = (await Tool.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true }).lean()) as unknown as ToolLean | null
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(toToolDTO(doc))
})

export default router
