import { MongoClient, type Document, type Filter, type MongoClientOptions } from 'mongodb'
import mysql from 'mysql2/promise'
import { z } from 'zod'
import {
  isLocalDbHost,
  redactSecretText,
} from './dbTypes.ts'

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const DEFAULT_MONGO_PORT = 27017
const DEFAULT_MYSQL_PORT = 3306
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_BATCH = 50

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = Record<string, JsonValue>
type SqlValue = string | number | boolean | null

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

const JsonObjectSchema = z.record(z.string(), JsonValueSchema)
const SqlValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])

const MongoConnectionSchema = z.object({
  uri: z.string().trim().min(1).max(600).optional(),
  host: z.string().trim().min(1).max(120).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().trim().min(1).max(120),
  username: z.string().trim().min(1).max(200).optional(),
  password: z.string().max(500).optional(),
  authSource: z.string().trim().min(1).max(120).optional(),
}).strict()

const MySqlConnectionSchema = z.object({
  host: z.string().trim().min(1).max(120).default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(DEFAULT_MYSQL_PORT),
  database: z.string().trim().min(1).max(120),
  user: z.string().trim().min(1).max(200),
  password: z.string().max(500).optional(),
}).strict()

const MongoCollectionInputShape = {
  connection: MongoConnectionSchema,
}

const MongoFindInputShape = {
  connection: MongoConnectionSchema,
  collection: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  filter: JsonObjectSchema.optional(),
  projection: JsonObjectSchema.optional(),
  sort: JsonObjectSchema.optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
}

const MongoInsertInputShape = {
  connection: MongoConnectionSchema,
  collection: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  document: JsonObjectSchema.optional(),
  documents: z.array(JsonObjectSchema).min(1).max(MAX_BATCH).optional(),
}

const MongoUpdateInputShape = {
  connection: MongoConnectionSchema,
  collection: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  filter: JsonObjectSchema,
  update: JsonObjectSchema,
  many: z.boolean().optional(),
}

const MongoDeleteInputShape = {
  connection: MongoConnectionSchema,
  collection: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  filter: JsonObjectSchema,
  many: z.boolean().optional(),
  allowAll: z.boolean().optional(),
}

const WhereSchema = z.record(z.string().regex(IDENTIFIER_PATTERN), SqlValueSchema)
const OrderBySchema = z.object({
  column: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  direction: z.enum(['asc', 'desc']).default('asc'),
}).strict()

const MySqlReadInputShape = {
  connection: MySqlConnectionSchema,
  table: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  columns: z.array(z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN)).min(1).max(40).optional(),
  where: WhereSchema.optional(),
  orderBy: OrderBySchema.optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
}

const MySqlInsertInputShape = {
  connection: MySqlConnectionSchema,
  table: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  row: WhereSchema.optional(),
  rows: z.array(WhereSchema).min(1).max(MAX_BATCH).optional(),
}

const MySqlUpdateInputShape = {
  connection: MySqlConnectionSchema,
  table: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  values: WhereSchema,
  where: WhereSchema.optional(),
  allowAll: z.boolean().optional(),
}

const MySqlDeleteInputShape = {
  connection: MySqlConnectionSchema,
  table: z.string().trim().min(1).max(120).regex(IDENTIFIER_PATTERN),
  where: WhereSchema.optional(),
  allowAll: z.boolean().optional(),
}

export const DbInputShapes = {
  mongodbListCollections: MongoCollectionInputShape,
  mongodbFind: MongoFindInputShape,
  mongodbInsert: MongoInsertInputShape,
  mongodbUpdate: MongoUpdateInputShape,
  mongodbDelete: MongoDeleteInputShape,
  mysqlListTables: { connection: MySqlConnectionSchema },
  mysqlSelect: MySqlReadInputShape,
  mysqlInsert: MySqlInsertInputShape,
  mysqlUpdate: MySqlUpdateInputShape,
  mysqlDelete: MySqlDeleteInputShape,
}

export type DbErrorCode =
  | 'validation_failure'
  | 'non_local_host'
  | 'database_failure'
  | 'internal_failure'

export class DbCommandError extends Error {
  readonly code: DbErrorCode

  constructor(code: DbErrorCode, message: string) {
    super(redactSecretText(message))
    this.name = 'DbCommandError'
    this.code = code
  }
}

function assertLocalHost(host: string | undefined): void {
  if (!isLocalDbHost(host)) {
    throw new DbCommandError('non_local_host', 'Database tools only allow localhost, 127.0.0.1, or ::1 connections.')
  }
}

function assertIdentifier(value: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new DbCommandError('validation_failure', `Invalid SQL identifier '${value}'.`)
  }
  return value
}

export function quoteIdentifier(value: string): string {
  return `\`${assertIdentifier(value)}\``
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, inner) => {
    if (typeof inner === 'bigint') return inner.toString()
    if (inner && typeof inner === 'object' && '_bsontype' in inner && 'toString' in inner) {
      return String(inner)
    }
    return inner
  }))
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new DbCommandError('validation_failure', parsed.error.message)
  return parsed.data
}

function mongoUri(input: z.infer<typeof MongoConnectionSchema>): { uri: string; options: MongoClientOptions } {
  if (input.uri) {
    let url: URL
    try {
      url = new URL(input.uri)
    } catch {
      throw new DbCommandError('validation_failure', 'MongoDB URI must be a valid mongodb:// localhost URL.')
    }
    if (url.protocol !== 'mongodb:') {
      throw new DbCommandError('validation_failure', 'MongoDB URI must use mongodb:// and must not use SRV.')
    }
    assertLocalHost(url.hostname)
    url.pathname = `/${encodeURIComponent(input.database)}`
    return { uri: url.toString(), options: { serverSelectionTimeoutMS: 5000 } }
  }

  const host = input.host ?? '127.0.0.1'
  assertLocalHost(host)
  const auth = input.username
    ? `${encodeURIComponent(input.username)}:${encodeURIComponent(input.password ?? '')}@`
    : ''
  const authSource = input.authSource ? `?authSource=${encodeURIComponent(input.authSource)}` : ''
  const bracketedHost = host === '::1' ? '[::1]' : host
  return {
    uri: `mongodb://${auth}${bracketedHost}:${input.port ?? DEFAULT_MONGO_PORT}/${encodeURIComponent(input.database)}${authSource}`,
    options: { serverSelectionTimeoutMS: 5000 },
  }
}

async function withMongo<T>(
  connection: z.infer<typeof MongoConnectionSchema>,
  run: (client: MongoClient) => Promise<T>,
): Promise<T> {
  const config = mongoUri(connection)
  const client = new MongoClient(config.uri, config.options)
  try {
    await client.connect()
    return await run(client)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new DbCommandError('database_failure', message)
  } finally {
    await client.close().catch(() => undefined)
  }
}

function assertDocumentBatch(document: JsonObject | undefined, documents: JsonObject[] | undefined): JsonObject[] {
  if (document && documents) {
    throw new DbCommandError('validation_failure', 'Provide either document or documents, not both.')
  }
  if (documents) return documents
  if (document) return [document]
  throw new DbCommandError('validation_failure', 'Provide document or documents.')
}

function assertNonEmptyWhere(where: Record<string, unknown> | undefined, allowAll: boolean | undefined): void {
  if (where && Object.keys(where).length > 0) return
  if (allowAll === true) return
  throw new DbCommandError('validation_failure', 'A non-empty where/filter is required unless allowAll is true.')
}

export async function executeMongoListCollections(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MongoCollectionInputShape).strict(), rawInput)
  return await withMongo(input.connection, async (client) => {
    const collections = await client.db(input.connection.database).listCollections().toArray()
    return { collections: collections.map((collection) => collection.name) }
  })
}

export async function executeMongoFind(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MongoFindInputShape).strict(), rawInput)
  return await withMongo(input.connection, async (client) => {
    const cursor = client
      .db(input.connection.database)
      .collection(input.collection)
      .find((input.filter ?? {}) as Filter<Document>, {
        projection: input.projection as Document | undefined,
        sort: input.sort as Document | undefined,
        limit: input.limit,
      })
    return { documents: jsonSafe(await cursor.toArray()) }
  })
}

export async function executeMongoInsert(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MongoInsertInputShape).strict(), rawInput)
  const documents = assertDocumentBatch(input.document, input.documents)
  return await withMongo(input.connection, async (client) => {
    const collection = client.db(input.connection.database).collection(input.collection)
    if (documents.length === 1) {
      const result = await collection.insertOne(documents[0] as Document)
      return { insertedCount: 1, insertedIds: [String(result.insertedId)] }
    }
    const result = await collection.insertMany(documents as Document[])
    return { insertedCount: result.insertedCount, insertedIds: Object.values(result.insertedIds).map(String) }
  })
}

export async function executeMongoUpdate(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MongoUpdateInputShape).strict(), rawInput)
  assertNonEmptyWhere(input.filter, false)
  return await withMongo(input.connection, async (client) => {
    const collection = client.db(input.connection.database).collection(input.collection)
    const result = input.many === true
      ? await collection.updateMany(input.filter as Filter<Document>, input.update as Document)
      : await collection.updateOne(input.filter as Filter<Document>, input.update as Document)
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId ? String(result.upsertedId) : null }
  })
}

export async function executeMongoDelete(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MongoDeleteInputShape).strict(), rawInput)
  assertNonEmptyWhere(input.filter, input.allowAll)
  return await withMongo(input.connection, async (client) => {
    const collection = client.db(input.connection.database).collection(input.collection)
    const result = input.many === true
      ? await collection.deleteMany(input.filter as Filter<Document>)
      : await collection.deleteOne(input.filter as Filter<Document>)
    return { deletedCount: result.deletedCount }
  })
}

function mysqlConnectionConfig(input: z.infer<typeof MySqlConnectionSchema>): mysql.ConnectionOptions {
  assertLocalHost(input.host)
  return {
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    connectTimeout: 5000,
    namedPlaceholders: false,
  }
}

async function withMySql<T>(
  connection: z.infer<typeof MySqlConnectionSchema>,
  run: (client: mysql.Connection) => Promise<T>,
): Promise<T> {
  let client: mysql.Connection | null = null
  try {
    client = await mysql.createConnection(mysqlConnectionConfig(connection))
    return await run(client)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new DbCommandError('database_failure', message)
  } finally {
    await client?.end().catch(() => undefined)
  }
}

function assertSqlValue(value: unknown, column: string): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new DbCommandError('validation_failure', `Column '${column}' must use a string, number, boolean, or null value.`)
}

function whereSql(where: Record<string, SqlValue> | undefined): { sql: string; params: SqlValue[] } {
  if (!where || Object.keys(where).length === 0) return { sql: '', params: [] }
  const parts: string[] = []
  const params: SqlValue[] = []
  for (const [column, value] of Object.entries(where)) {
    if (value === null) {
      parts.push(`${quoteIdentifier(column)} IS NULL`)
    } else {
      parts.push(`${quoteIdentifier(column)} = ?`)
      params.push(assertSqlValue(value, column))
    }
  }
  return { sql: ` WHERE ${parts.join(' AND ')}`, params }
}

export function buildMySqlSelect(
  table: string,
  options: {
    columns?: string[]
    where?: Record<string, SqlValue>
    orderBy?: { column: string; direction: 'asc' | 'desc' }
    limit?: number
  } = {},
): { sql: string; params: SqlValue[] } {
  const columns = options.columns?.length
    ? options.columns.map(quoteIdentifier).join(', ')
    : '*'
  const where = whereSql(options.where)
  const order = options.orderBy
    ? ` ORDER BY ${quoteIdentifier(options.orderBy.column)} ${options.orderBy.direction.toUpperCase()}`
    : ''
  return {
    sql: `SELECT ${columns} FROM ${quoteIdentifier(table)}${where.sql}${order} LIMIT ?`,
    params: [...where.params, options.limit ?? DEFAULT_LIMIT],
  }
}

export function buildMySqlInsert(
  table: string,
  rows: Array<Record<string, SqlValue>>,
): { sql: string; params: SqlValue[] } {
  if (rows.length === 0) throw new DbCommandError('validation_failure', 'At least one row is required.')
  const columns = Object.keys(rows[0])
  if (columns.length === 0) throw new DbCommandError('validation_failure', 'Rows must contain at least one column.')
  for (const row of rows) {
    const keys = Object.keys(row)
    if (keys.length !== columns.length || keys.some((key) => !columns.includes(key))) {
      throw new DbCommandError('validation_failure', 'All inserted rows must have the same columns.')
    }
  }
  const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${rows.map(() => rowPlaceholders).join(', ')}`
  return { sql, params: rows.flatMap((row) => columns.map((column) => assertSqlValue(row[column], column))) }
}

export function buildMySqlUpdate(
  table: string,
  values: Record<string, SqlValue>,
  where: Record<string, SqlValue> | undefined,
  allowAll?: boolean,
): { sql: string; params: SqlValue[] } {
  const columns = Object.keys(values)
  if (columns.length === 0) throw new DbCommandError('validation_failure', 'At least one update value is required.')
  assertNonEmptyWhere(where, allowAll)
  const setSql = columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')
  const wherePart = whereSql(where)
  return { sql: `UPDATE ${quoteIdentifier(table)} SET ${setSql}${wherePart.sql}`, params: [...columns.map((column) => assertSqlValue(values[column], column)), ...wherePart.params] }
}

export function buildMySqlDelete(
  table: string,
  where: Record<string, SqlValue> | undefined,
  allowAll?: boolean,
): { sql: string; params: SqlValue[] } {
  assertNonEmptyWhere(where, allowAll)
  const wherePart = whereSql(where)
  return { sql: `DELETE FROM ${quoteIdentifier(table)}${wherePart.sql}`, params: wherePart.params }
}

function resultMeta(result: unknown): Record<string, unknown> {
  const packet = result as { affectedRows?: number; changedRows?: number; insertId?: number | string }
  return {
    affectedRows: packet.affectedRows,
    changedRows: packet.changedRows,
    insertId: packet.insertId,
  }
}

export async function executeMySqlListTables(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object({ connection: MySqlConnectionSchema }).strict(), rawInput)
  return await withMySql(input.connection, async (client) => {
    const [rows] = await client.execute('SHOW TABLES')
    return { tables: (rows as Record<string, unknown>[]).map((row) => Object.values(row)[0]) }
  })
}

export async function executeMySqlSelect(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MySqlReadInputShape).strict(), rawInput)
  return await withMySql(input.connection, async (client) => {
    const query = buildMySqlSelect(input.table, input)
    const [rows] = await client.execute(query.sql, query.params)
    return { rows: jsonSafe(rows) }
  })
}

export async function executeMySqlInsert(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MySqlInsertInputShape).strict(), rawInput)
  const rows = input.rows ?? (input.row ? [input.row] : [])
  if (rows.length === 0) throw new DbCommandError('validation_failure', 'Provide row or rows.')
  return await withMySql(input.connection, async (client) => {
    const query = buildMySqlInsert(input.table, rows)
    const [result] = await client.execute(query.sql, query.params)
    return resultMeta(result)
  })
}

export async function executeMySqlUpdate(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MySqlUpdateInputShape).strict(), rawInput)
  return await withMySql(input.connection, async (client) => {
    const query = buildMySqlUpdate(input.table, input.values, input.where, input.allowAll)
    const [result] = await client.execute(query.sql, query.params)
    return resultMeta(result)
  })
}

export async function executeMySqlDelete(rawInput: unknown): Promise<Record<string, unknown>> {
  const input = validate(z.object(MySqlDeleteInputShape).strict(), rawInput)
  return await withMySql(input.connection, async (client) => {
    const query = buildMySqlDelete(input.table, input.where, input.allowAll)
    const [result] = await client.execute(query.sql, query.params)
    return resultMeta(result)
  })
}

export { DB_MCP_TOOL_TO_TOGGLE } from './dbTypes.ts'
