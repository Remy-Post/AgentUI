import { Router } from 'express'
import mongoose from 'mongoose'
import { Skill } from '../db/models/Skill.ts'
import { writeSkillFile, removeSkillFile } from '../agent/scaffold.ts'

const router = Router()

router.get('/', async (_req, res) => {
  const docs = await Skill.find().sort({ name: 1 }).lean()
  res.json(docs)
})

router.post('/', async (req, res) => {
  try {
    const doc = await Skill.create(req.body)
    if (doc.enabled) await writeSkillFile(doc)
    return res.status(201).json(doc)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed'
    return res.status(400).json({ error: message })
  }
})

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const previous = await Skill.findById(req.params.id)
  if (!previous) return res.status(404).json({ error: 'not_found' })
  const updated = await Skill.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!updated) return res.status(404).json({ error: 'not_found' })

  // Remove old file if name changed; rewrite under current state.
  if (previous.name !== updated.name) {
    await removeSkillFile(previous.name)
  }
  if (updated.enabled) {
    await writeSkillFile(updated)
  } else {
    await removeSkillFile(updated.name)
  }
  return res.json(updated)
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Skill.findByIdAndDelete(req.params.id)
  if (!doc) return res.status(404).json({ error: 'not_found' })
  await removeSkillFile(doc.name)
  return res.status(204).end()
})

export default router
