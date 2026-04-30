import { Router } from 'express'
import mongoose from 'mongoose'
import { Memory } from '../db/models/Memory.ts'
import { toMemoryDTO } from '../agent/memory.ts'
import type { CreateMemoryRequest, MemoryType, UpdateMemoryRequest } from '../shared/types.ts'

const router = Router()

const MEMORY_TYPES = ['preference', 'fact', 'project', 'instruction', 'note'] as const satisfies readonly MemoryType[]

function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
}

function readQueryString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[,\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTags(value: unknown): string[] | null {
  if (value === undefined || value === null) return []

  const rawTags =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
        : null

  if (!rawTags) return null

  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of rawTags) {
    const tag = normalizeTag(raw)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

function normalizeOptionalObjectId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) return null
  return value
}

function memoryTypeOrDefault(value: unknown): MemoryType | null {
  if (value === undefined) return 'note'
  return isMemoryType(value) ? value : null
}

function buildCreatePayload(body: Record<string, unknown>): CreateMemoryRequest | { error: string } {
  const title = requiredString(body.title)
  if (!title) return { error: 'empty_title' }
  const content = requiredString(body.content)
  if (!content) return { error: 'empty_content' }
  const type = memoryTypeOrDefault(body.type)
  if (!type) return { error: 'invalid_type' }
  const tags = normalizeTags(body.tags)
  if (!tags) return { error: 'invalid_tags' }

  const sourceConversationId = normalizeOptionalObjectId(body.sourceConversationId)
  if (sourceConversationId === null) return { error: 'invalid_source_conversation_id' }
  const sourceMessageId = normalizeOptionalObjectId(body.sourceMessageId)
  if (sourceMessageId === null) return { error: 'invalid_source_message_id' }

  return {
    title,
    content,
    type,
    tags,
    sourceConversationId,
    sourceMessageId,
  }
}

router.get('/', async (req, res) => {
  const search = readQueryString(req.query.search)
  const type = readQueryString(req.query.type)
  const tag = normalizeTag(readQueryString(req.query.tag))

  const filter: Record<string, unknown> = {}
  if (type) {
    if (!isMemoryType(type)) return res.status(400).json({ error: 'invalid_type' })
    filter.type = type
  }
  if (tag) filter.tags = tag
  if (search) filter.$text = { $search: search }

  const query = search
    ? Memory.find(filter, { score: { $meta: 'textScore' } }).sort({
        score: { $meta: 'textScore' },
        updatedAt: -1,
      })
    : Memory.find(filter).sort({ updatedAt: -1 })

  const docs = await query.lean()
  return res.json(docs.map(toMemoryDTO))
})

router.post('/', async (req, res) => {
  const payload = buildCreatePayload((req.body ?? {}) as Record<string, unknown>)
  if ('error' in payload) return res.status(400).json({ error: payload.error })

  try {
    const doc = await Memory.create(payload)
    return res.status(201).json(toMemoryDTO(doc))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_failed'
    return res.status(400).json({ error: message })
  }
})

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })

  const body = (req.body ?? {}) as Record<string, unknown> & UpdateMemoryRequest
  const update: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}

  if ('title' in body) {
    const title = requiredString(body.title)
    if (!title) return res.status(400).json({ error: 'empty_title' })
    update.title = title
  }
  if ('content' in body) {
    const content = requiredString(body.content)
    if (!content) return res.status(400).json({ error: 'empty_content' })
    update.content = content
  }
  if ('type' in body) {
    if (!isMemoryType(body.type)) return res.status(400).json({ error: 'invalid_type' })
    update.type = body.type
  }
  if ('tags' in body) {
    const tags = normalizeTags(body.tags)
    if (!tags) return res.status(400).json({ error: 'invalid_tags' })
    update.tags = tags
  }
  if ('sourceConversationId' in body) {
    const sourceConversationId = normalizeOptionalObjectId(body.sourceConversationId)
    if (sourceConversationId === null) {
      return res.status(400).json({ error: 'invalid_source_conversation_id' })
    }
    if (sourceConversationId) update.sourceConversationId = sourceConversationId
    else unset.sourceConversationId = ''
  }
  if ('sourceMessageId' in body) {
    const sourceMessageId = normalizeOptionalObjectId(body.sourceMessageId)
    if (sourceMessageId === null) return res.status(400).json({ error: 'invalid_source_message_id' })
    if (sourceMessageId) update.sourceMessageId = sourceMessageId
    else unset.sourceMessageId = ''
  }

  const changes: Record<string, unknown> = {}
  if (Object.keys(update).length > 0) changes.$set = update
  if (Object.keys(unset).length > 0) changes.$unset = unset
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = await Memory.findByIdAndUpdate(req.params.id, changes, { new: true }).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(toMemoryDTO(doc as Record<string, unknown> & { _id: unknown }))
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Memory.findByIdAndDelete(req.params.id)
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.status(204).end()
})

export default router
