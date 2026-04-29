import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import {
  DbCommandError,
  DbInputShapes,
  executeMongoDelete,
  executeMongoFind,
  executeMongoInsert,
  executeMongoListCollections,
  executeMongoUpdate,
  executeMySqlDelete,
  executeMySqlInsert,
  executeMySqlListTables,
  executeMySqlSelect,
  executeMySqlUpdate,
} from './dbCommand.ts'
import { DB_MCP_TOOL_TO_TOGGLE, type DbToolId, parseAllowedDbToolIds, redactSecretText } from './dbTypes.ts'

type DbToolRegistration = {
  name: keyof typeof DB_MCP_TOOL_TO_TOGGLE
  title: string
  description: string
  inputSchema: z.ZodRawShape
  readOnly?: boolean
  execute: (input: unknown) => Promise<Record<string, unknown>>
}

function toolResult(value: Record<string, unknown>, isError = false): CallToolResult {
  return {
    isError,
    structuredContent: value,
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  }
}

function errorResult(error: unknown): CallToolResult {
  if (error instanceof DbCommandError) {
    return toolResult({ ok: false, error: { code: error.code, message: error.message } }, true)
  }
  if (error instanceof Error) {
    return toolResult({
      ok: false,
      error: { code: 'internal_failure', message: redactSecretText(error.message) },
    }, true)
  }
  return toolResult({ ok: false, error: { code: 'internal_failure', message: 'Unknown database tool error.' } }, true)
}

const TOOL_REGISTRY: DbToolRegistration[] = [
  {
    name: 'db_mongodb_list_collections',
    title: 'MongoDB list collections',
    description: 'List collections in a local MongoDB database.',
    inputSchema: DbInputShapes.mongodbListCollections,
    readOnly: true,
    execute: executeMongoListCollections,
  },
  {
    name: 'db_mongodb_find',
    title: 'MongoDB find',
    description: 'Find documents in a local MongoDB collection using a structured filter.',
    inputSchema: DbInputShapes.mongodbFind,
    readOnly: true,
    execute: executeMongoFind,
  },
  {
    name: 'db_mongodb_insert',
    title: 'MongoDB insert',
    description: 'Insert one or more documents into a local MongoDB collection.',
    inputSchema: DbInputShapes.mongodbInsert,
    execute: executeMongoInsert,
  },
  {
    name: 'db_mongodb_update',
    title: 'MongoDB update',
    description: 'Update documents in a local MongoDB collection.',
    inputSchema: DbInputShapes.mongodbUpdate,
    execute: executeMongoUpdate,
  },
  {
    name: 'db_mongodb_delete',
    title: 'MongoDB delete',
    description: 'Delete documents from a local MongoDB collection.',
    inputSchema: DbInputShapes.mongodbDelete,
    execute: executeMongoDelete,
  },
  {
    name: 'db_mysql_list_tables',
    title: 'MySQL list tables',
    description: 'List tables in a local MySQL database.',
    inputSchema: DbInputShapes.mysqlListTables,
    readOnly: true,
    execute: executeMySqlListTables,
  },
  {
    name: 'db_mysql_select',
    title: 'MySQL select',
    description: 'Select rows from a local MySQL table using structured filters.',
    inputSchema: DbInputShapes.mysqlSelect,
    readOnly: true,
    execute: executeMySqlSelect,
  },
  {
    name: 'db_mysql_insert',
    title: 'MySQL insert',
    description: 'Insert one or more rows into a local MySQL table.',
    inputSchema: DbInputShapes.mysqlInsert,
    execute: executeMySqlInsert,
  },
  {
    name: 'db_mysql_update',
    title: 'MySQL update',
    description: 'Update rows in a local MySQL table.',
    inputSchema: DbInputShapes.mysqlUpdate,
    execute: executeMySqlUpdate,
  },
  {
    name: 'db_mysql_delete',
    title: 'MySQL delete',
    description: 'Delete rows from a local MySQL table.',
    inputSchema: DbInputShapes.mysqlDelete,
    execute: executeMySqlDelete,
  },
]

function registerDbTool(
  server: McpServer,
  tool: DbToolRegistration,
  allowedTools: Set<DbToolId>,
): void {
  const requiredToggle = DB_MCP_TOOL_TO_TOGGLE[tool.name]
  if (!allowedTools.has(requiredToggle)) return

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.readOnly === true,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        return toolResult({ ok: true, ...(await tool.execute(input)) })
      } catch (error) {
        return errorResult(error)
      }
    },
  )
}

async function main(): Promise<void> {
  const allowedTools = new Set(parseAllowedDbToolIds(process.env.AGENTUI_DB_ALLOWED_TOOLS))
  const server = new McpServer({
    name: 'agentui-db',
    version: '1.0.0',
  })

  for (const tool of TOOL_REGISTRY) registerDbTool(server, tool, allowedTools)
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  const message = error instanceof Error ? redactSecretText(error.message) : String(error)
  process.stderr.write(`[agentui-db-mcp] ${message}\n`)
  process.exit(1)
})
