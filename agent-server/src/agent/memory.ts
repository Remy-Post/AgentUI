import mongoose from 'mongoose'
import { Memory } from '../db/models/Memory.ts'
import type { MemoryDTO, MemoryType } from '../shared/types.ts'

type MemoryLike = {
  _id: unknown
  title?: unknown
  content?: unknown
  type?: unknown
  tags?: unknown
  sourceConversationId?: unknown
  sourceMessageId?: unknown
  usageCount?: unknown
  lastUsedAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

function objectIdString(value: unknown): string | undefined {
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  if (typeof value === 'string' && value.length > 0) return value
  if (value && typeof value === 'object' && 'toString' in value) return String(value)
  return undefined
}

function dateString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return undefined
}

function memoryType(value: unknown): MemoryType {
  if (
    value === 'preference' ||
    value === 'fact' ||
    value === 'project' ||
    value === 'instruction' ||
    value === 'note'
  ) {
    return value
  }
  return 'note'
}

export function toMemoryDTO(memory: MemoryLike): MemoryDTO {
  return {
    _id: objectIdString(memory._id) ?? '',
    title: typeof memory.title === 'string' ? memory.title : '',
    content: typeof memory.content === 'string' ? memory.content : '',
    type: memoryType(memory.type),
    tags: Array.isArray(memory.tags)
      ? memory.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    sourceConversationId: objectIdString(memory.sourceConversationId),
    sourceMessageId: objectIdString(memory.sourceMessageId),
    usageCount:
      typeof memory.usageCount === 'number' && Number.isFinite(memory.usageCount)
        ? memory.usageCount
        : 0,
    lastUsedAt: dateString(memory.lastUsedAt),
    createdAt: dateString(memory.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dateString(memory.updatedAt) ?? new Date(0).toISOString(),
  }
}

export async function findRelevantMemories(input: string, limit = 6): Promise<MemoryDTO[]> {
  const search = input.trim()
  if (!search) return []

  try {
    const docs = await Memory.find(
      { $text: { $search: search } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
      .limit(Math.max(1, Math.min(limit, 20)))
      .lean<MemoryLike[]>()

    return docs.map(toMemoryDTO)
  } catch (error) {
    // Text index is created lazily on first insert; treat any indexing or
    // transient failure here as "no recall available" so callers don't crash.
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[memory] findRelevantMemories failed:', message)
    return []
  }
}
