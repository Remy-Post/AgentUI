import mongoose from 'mongoose'
import { Memory } from '../db/models/Memory.ts'
import type { CreateMemoryRequest, MemoryDTO, MemoryType } from '../shared/types.ts'
import { toMemoryDTO } from './memory.ts'

export const MEMORY_TYPES = ['preference', 'fact', 'project', 'instruction', 'note'] as const satisfies readonly MemoryType[]

export class NotesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'NotesError'
  }
}

type ListNotesInput = {
  search?: unknown
  type?: unknown
  tag?: unknown
  limit?: unknown
}

type UpdatePayload = {
  changes: Record<string, unknown>
}

function fail(code: string, message: string, status = 400): never {
  throw new NotesError(code, message, status)
}

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
}

export function isMissingTextIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && /text index required/i.test(message)
}

function readQueryString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code, 'Required text field is missing.')
  const trimmed = value.trim()
  if (!trimmed) fail(code, 'Required text field is empty.')
  return trimmed
}

export function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[,\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return []

  const rawTags =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
        : null

  if (!rawTags) fail('invalid_tags', 'Tags must be a string or string array.')

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

function normalizeOptionalObjectId(value: unknown, code: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    fail(code, 'Invalid ObjectId.')
  }
  return value
}

function memoryTypeOrDefault(value: unknown): MemoryType {
  if (value === undefined) return 'note'
  if (!isMemoryType(value)) fail('invalid_type', 'Invalid note type.')
  return value
}

function normalizeLimit(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback
  const raw = typeof value === 'string' ? Number(value) : value
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    fail('invalid_limit', 'Limit must be a positive integer.')
  }
  return Math.min(raw, 50)
}

function validateId(id: unknown): string {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    fail('invalid_id', 'Invalid note id.')
  }
  return id
}

export function buildCreateNotePayload(body: Record<string, unknown>): CreateMemoryRequest {
  const title = requiredString(body.title, 'empty_title')
  const content = requiredString(body.content, 'empty_content')
  const type = memoryTypeOrDefault(body.type)
  const tags = normalizeTags(body.tags)
  const sourceConversationId = normalizeOptionalObjectId(
    body.sourceConversationId,
    'invalid_source_conversation_id',
  )
  const sourceMessageId = normalizeOptionalObjectId(body.sourceMessageId, 'invalid_source_message_id')

  return {
    title,
    content,
    type,
    tags,
    sourceConversationId,
    sourceMessageId,
  }
}

export function buildUpdateNotePayload(body: Record<string, unknown>): UpdatePayload {
  const update: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}

  if ('title' in body) update.title = requiredString(body.title, 'empty_title')
  if ('content' in body) update.content = requiredString(body.content, 'empty_content')
  if ('type' in body) {
    if (!isMemoryType(body.type)) fail('invalid_type', 'Invalid note type.')
    update.type = body.type
  }
  if ('tags' in body) update.tags = normalizeTags(body.tags)
  if ('sourceConversationId' in body) {
    const sourceConversationId = normalizeOptionalObjectId(
      body.sourceConversationId,
      'invalid_source_conversation_id',
    )
    if (sourceConversationId) update.sourceConversationId = sourceConversationId
    else unset.sourceConversationId = ''
  }
  if ('sourceMessageId' in body) {
    const sourceMessageId = normalizeOptionalObjectId(body.sourceMessageId, 'invalid_source_message_id')
    if (sourceMessageId) update.sourceMessageId = sourceMessageId
    else unset.sourceMessageId = ''
  }

  const changes: Record<string, unknown> = {}
  if (Object.keys(update).length > 0) changes.$set = update
  if (Object.keys(unset).length > 0) changes.$unset = unset
  if (Object.keys(changes).length === 0) fail('no_op', 'No note changes were provided.')

  return { changes }
}

export async function listNotes(input: ListNotesInput = {}): Promise<MemoryDTO[]> {
  const search = readQueryString(input.search)
  const type = readQueryString(input.type)
  const tag = normalizeTag(readQueryString(input.tag))
  const limit = normalizeLimit(input.limit)

  const filter: Record<string, unknown> = {}
  if (type) {
    if (!isMemoryType(type)) fail('invalid_type', 'Invalid note type.')
    filter.type = type
  }
  if (tag) filter.tags = tag
  if (search) filter.$text = { $search: search }

  try {
    const query = search
      ? Memory.find(filter, { score: { $meta: 'textScore' } }).sort({
          score: { $meta: 'textScore' },
          updatedAt: -1,
        })
      : Memory.find(filter).sort({ updatedAt: -1 })

    if (limit) query.limit(limit)
    const docs = await query.lean()
    return docs.map(toMemoryDTO)
  } catch (error) {
    if (search && isMissingTextIndexError(error)) return []
    throw error
  }
}

export async function getNote(id: unknown): Promise<MemoryDTO> {
  const noteId = validateId(id)
  const doc = await Memory.findById(noteId).lean()
  if (!doc) fail('not_found', 'Note not found.', 404)
  return toMemoryDTO(doc as Record<string, unknown> & { _id: unknown })
}

export async function createNote(body: Record<string, unknown>): Promise<MemoryDTO> {
  const payload = buildCreateNotePayload(body)
  const doc = await Memory.create(payload)
  return toMemoryDTO(doc)
}

export async function updateNote(id: unknown, body: Record<string, unknown>): Promise<MemoryDTO> {
  const noteId = validateId(id)
  const { changes } = buildUpdateNotePayload(body)
  const doc = await Memory.findByIdAndUpdate(noteId, changes, {
    new: true,
    runValidators: true,
  }).lean()
  if (!doc) fail('not_found', 'Note not found.', 404)
  return toMemoryDTO(doc as Record<string, unknown> & { _id: unknown })
}

export async function deleteNote(id: unknown): Promise<MemoryDTO> {
  const noteId = validateId(id)
  const doc = await Memory.findByIdAndDelete(noteId).lean()
  if (!doc) fail('not_found', 'Note not found.', 404)
  return toMemoryDTO(doc as Record<string, unknown> & { _id: unknown })
}
