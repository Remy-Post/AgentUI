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
