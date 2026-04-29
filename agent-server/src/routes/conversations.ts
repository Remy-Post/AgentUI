import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { dropSession } from '../agent/session.ts'
import { MODELS } from '../../util/vars.ts'

const router = Router()

router.get('/', async (_req, res) => {
  const docs = await Conversation.find().sort({ updatedAt: -1 }).lean()
  res.json(docs)
})

router.post('/', async (req, res) => {
  const { title, model } = req.body ?? {}
  const doc = await Conversation.create({
    title: title ?? 'New conversation',
    model: model ?? MODELS.opus,
  })
  res.status(201).json(doc)
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Conversation.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(doc)
})

const EFFORT_VALUES = ['low', 'medium', 'high'] as const
type Effort = (typeof EFFORT_VALUES)[number]

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title
  if (typeof body.effort === 'string') {
    if (!EFFORT_VALUES.includes(body.effort as Effort)) {
      return res.status(400).json({ error: 'invalid_effort' })
    }
    update.effort = body.effort
  }
  if (Array.isArray(body.attachedSkillIds) && body.attachedSkillIds.every((s) => typeof s === 'string')) {
    update.attachedSkillIds = body.attachedSkillIds
  }
  if (Array.isArray(body.attachedSubagentIds) && body.attachedSubagentIds.every((s) => typeof s === 'string')) {
    update.attachedSubagentIds = body.attachedSubagentIds
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = await Conversation.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(doc)
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  await Promise.all([
    Conversation.deleteOne({ _id: req.params.id }),
    Message.deleteMany({ conversationId: req.params.id }),
  ])
  dropSession(req.params.id)
  return res.status(204).end()
})

router.get('/:id/messages', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const docs = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean()
  return res.json(docs)
})

export default router
