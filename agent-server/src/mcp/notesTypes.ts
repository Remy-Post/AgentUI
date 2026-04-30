export const NOTES_TOOL_IDS = [
  'notes.read',
  'notes.create',
  'notes.update',
  'notes.delete',
] as const

export type NotesToolId = (typeof NOTES_TOOL_IDS)[number]

const NOTES_TOOL_SET = new Set<string>(NOTES_TOOL_IDS)

export function isNotesToolId(value: string): value is NotesToolId {
  return NOTES_TOOL_SET.has(value)
}

export const NOTES_MCP_TOOL_TO_TOGGLE: Record<string, NotesToolId> = {
  notes_search: 'notes.read',
  notes_get: 'notes.read',
  notes_create: 'notes.create',
  notes_update: 'notes.update',
  notes_delete: 'notes.delete',
}

export function uniqueNotesToolIds(values: Iterable<string> | undefined): NotesToolId[] {
  const out: NotesToolId[] = []
  const seen = new Set<NotesToolId>()
  for (const value of values ?? []) {
    if (!isNotesToolId(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function parseAllowedNotesToolIds(value: string | undefined): NotesToolId[] {
  if (!value || value.trim().length === 0) return []
  const raw = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  const invalid = raw.filter((part) => !isNotesToolId(part))
  if (invalid.length > 0) {
    throw new Error(`Unsupported notes tool id(s): ${invalid.join(', ')}`)
  }
  return uniqueNotesToolIds(raw)
}
