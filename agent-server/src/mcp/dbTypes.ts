export const DB_TOOL_IDS = [
  'mongodb.read',
  'mongodb.create',
  'mongodb.update',
  'mongodb.delete',
  'mysql.read',
  'mysql.create',
  'mysql.update',
  'mysql.delete',
] as const

export type DbToolId = (typeof DB_TOOL_IDS)[number]
export type DbEngine = 'mongodb' | 'mysql'
export type DbOperation = 'read' | 'create' | 'update' | 'delete'

const DB_TOOL_SET = new Set<string>(DB_TOOL_IDS)

export function isDbToolId(value: string): value is DbToolId {
  return DB_TOOL_SET.has(value)
}

export function dbToolId(engine: DbEngine, operation: DbOperation): DbToolId {
  return `${engine}.${operation}` as DbToolId
}

export const DB_MCP_TOOL_TO_TOGGLE: Record<string, DbToolId> = {
  db_mongodb_list_collections: dbToolId('mongodb', 'read'),
  db_mongodb_find: dbToolId('mongodb', 'read'),
  db_mongodb_insert: dbToolId('mongodb', 'create'),
  db_mongodb_update: dbToolId('mongodb', 'update'),
  db_mongodb_delete: dbToolId('mongodb', 'delete'),
  db_mysql_list_tables: dbToolId('mysql', 'read'),
  db_mysql_select: dbToolId('mysql', 'read'),
  db_mysql_insert: dbToolId('mysql', 'create'),
  db_mysql_update: dbToolId('mysql', 'update'),
  db_mysql_delete: dbToolId('mysql', 'delete'),
}

export function dbToolParts(value: string): { engine: DbEngine; operation: DbOperation } | null {
  if (!isDbToolId(value)) return null
  const [engine, operation] = value.split('.') as [DbEngine, DbOperation]
  return { engine, operation }
}

export function uniqueDbToolIds(values: Iterable<string> | undefined): DbToolId[] {
  const out: DbToolId[] = []
  const seen = new Set<DbToolId>()
  for (const value of values ?? []) {
    if (!isDbToolId(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export function parseAllowedDbToolIds(value: string | undefined): DbToolId[] {
  if (!value || value.trim().length === 0) return []
  const raw = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  const invalid = raw.filter((part) => !isDbToolId(part))
  if (invalid.length > 0) {
    throw new Error(`Unsupported database tool id(s): ${invalid.join(', ')}`)
  }
  return uniqueDbToolIds(raw)
}

export function isLocalDbHost(host: string | undefined): boolean {
  const normalized = (host || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function redactSecretText(value: string): string {
  return value
    .replace(/(mongodb(?:\+srv)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, '$1[redacted]$3')
    .replace(/(password|passwd|pwd)\s*[=:]\s*([^,;\s}]+)/gi, '$1=[redacted]')
    .replace(/("password"\s*:\s*")([^"]*)(")/gi, '$1[redacted]$3')
}
