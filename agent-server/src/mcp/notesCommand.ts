import { z } from 'zod'
import {
  MEMORY_TYPES,
  NotesError,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from '../agent/notes.ts'
import type { MemoryDTO } from '../shared/types.ts'

const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 20
const SEARCH_SNIPPET_CHARS = 320
const GET_CONTENT_CHARS = 12_000

const MemoryTypeSchema = z.enum(MEMORY_TYPES)
const TagsSchema = z.union([z.string(), z.array(z.string())])

export class NotesCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'NotesCommandError'
  }
}

export const NotesInputShapes = {
  search: {
    search: z.string().optional(),
    type: MemoryTypeSchema.optional(),
    tag: z.string().optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  },
  get: {
    id: z.string().min(1),
  },
  create: {
    title: z.string().min(1),
    content: z.string().min(1),
    type: MemoryTypeSchema.optional(),
    tags: TagsSchema.optional(),
    sourceConversationId: z.string().optional(),
    sourceMessageId: z.string().optional(),
  },
  update: {
    id: z.string().min(1),
    title: z.string().optional(),
    content: z.string().optional(),
    type: MemoryTypeSchema.optional(),
    tags: TagsSchema.optional(),
    sourceConversationId: z.union([z.string(), z.null()]).optional(),
    sourceMessageId: z.union([z.string(), z.null()]).optional(),
  },
  delete: {
    id: z.string().min(1),
  },
} as const

function parseInput<T extends z.ZodRawShape>(shape: T, input: unknown): z.infer<z.ZodObject<T>> {
  const parsed = z.object(shape).safeParse(input)
  if (!parsed.success) {
    throw new NotesCommandError('validation_failure', parsed.error.issues.map((issue) => issue.message).join('; '))
  }
  return parsed.data
}

function truncate(value: string, limit: number): { text: string; truncated: boolean } {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= limit) return { text: compact, truncated: false }
  return { text: `${compact.slice(0, Math.max(0, limit - 3))}...`, truncated: true }
}

function truncateContent(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: `${value.slice(0, Math.max(0, limit - 3))}...`, truncated: true }
}

function compactNote(note: MemoryDTO): Record<string, unknown> {
  const snippet = truncate(note.content, SEARCH_SNIPPET_CHARS)
  return {
    id: note._id,
    title: note.title,
    type: note.type,
    tags: note.tags,
    snippet: snippet.text,
    snippetTruncated: snippet.truncated,
    usageCount: note.usageCount,
    lastUsedAt: note.lastUsedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

function fullNote(note: MemoryDTO): Record<string, unknown> {
  const content = truncateContent(note.content, GET_CONTENT_CHARS)
  return {
    id: note._id,
    title: note.title,
    content: content.text,
    contentTruncated: content.truncated,
    type: note.type,
    tags: note.tags,
    sourceConversationId: note.sourceConversationId,
    sourceMessageId: note.sourceMessageId,
    usageCount: note.usageCount,
    lastUsedAt: note.lastUsedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

export async function executeNotesSearch(input: unknown): Promise<Record<string, unknown>> {
  const parsed = parseInput(NotesInputShapes.search, input)
  const notes = await listNotes({
    search: parsed.search,
    type: parsed.type,
    tag: parsed.tag,
    limit: parsed.limit ?? DEFAULT_SEARCH_LIMIT,
  })
  return {
    count: notes.length,
    notes: notes.map(compactNote),
  }
}

export async function executeNotesGet(input: unknown): Promise<Record<string, unknown>> {
  const parsed = parseInput(NotesInputShapes.get, input)
  const note = await getNote(parsed.id)
  return {
    note: fullNote(note),
  }
}

export async function executeNotesCreate(input: unknown): Promise<Record<string, unknown>> {
  const parsed = parseInput(NotesInputShapes.create, input)
  const note = await createNote({
    ...parsed,
    type: parsed.type ?? 'note',
  })
  return {
    note: fullNote(note),
  }
}

export async function executeNotesUpdate(input: unknown): Promise<Record<string, unknown>> {
  const parsed = parseInput(NotesInputShapes.update, input)
  const { id, ...body } = parsed
  const note = await updateNote(id, body)
  return {
    note: fullNote(note),
  }
}

export async function executeNotesDelete(input: unknown): Promise<Record<string, unknown>> {
  const parsed = parseInput(NotesInputShapes.delete, input)
  const note = await deleteNote(parsed.id)
  return {
    deleted: true,
    note: compactNote(note),
  }
}

export function notesErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof NotesError || error instanceof NotesCommandError) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof Error) {
    return { ok: false, error: { code: 'internal_failure', message: error.message } }
  }
  return { ok: false, error: { code: 'internal_failure', message: 'Unknown notes tool error.' } }
}
