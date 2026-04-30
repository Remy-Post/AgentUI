import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import { connectDb } from '../db/connection.ts'
import {
  NotesInputShapes,
  executeNotesCreate,
  executeNotesDelete,
  executeNotesGet,
  executeNotesSearch,
  executeNotesUpdate,
  notesErrorPayload,
} from './notesCommand.ts'
import { NOTES_MCP_TOOL_TO_TOGGLE, type NotesToolId, parseAllowedNotesToolIds } from './notesTypes.ts'

type NotesToolRegistration = {
  name: keyof typeof NOTES_MCP_TOOL_TO_TOGGLE
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
  return toolResult(notesErrorPayload(error), true)
}

const TOOL_REGISTRY: NotesToolRegistration[] = [
  {
    name: 'notes_search',
    title: 'Search Notes',
    description: 'Search and filter AgentUI Notes. Returns compact snippets and note IDs.',
    inputSchema: NotesInputShapes.search,
    readOnly: true,
    execute: executeNotesSearch,
  },
  {
    name: 'notes_get',
    title: 'Get Note',
    description: 'Fetch one AgentUI Note by ID, with capped full content.',
    inputSchema: NotesInputShapes.get,
    readOnly: true,
    execute: executeNotesGet,
  },
  {
    name: 'notes_create',
    title: 'Create Note',
    description: 'Create a new user-visible AgentUI Note. Defaults to type "note" if omitted.',
    inputSchema: NotesInputShapes.create,
    execute: executeNotesCreate,
  },
  {
    name: 'notes_update',
    title: 'Update Note',
    description: 'Update a user-visible AgentUI Note by ID.',
    inputSchema: NotesInputShapes.update,
    execute: executeNotesUpdate,
  },
  {
    name: 'notes_delete',
    title: 'Delete Note',
    description: 'Delete a user-visible AgentUI Note by ID.',
    inputSchema: NotesInputShapes.delete,
    execute: executeNotesDelete,
  },
]

function registerNotesTool(
  server: McpServer,
  tool: NotesToolRegistration,
  allowedTools: Set<NotesToolId>,
): void {
  const requiredToggle = NOTES_MCP_TOOL_TO_TOGGLE[tool.name]
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
  const allowedTools = new Set(parseAllowedNotesToolIds(process.env.AGENTUI_NOTES_ALLOWED_TOOLS))
  await connectDb()

  const server = new McpServer({
    name: 'agentui-notes',
    version: '1.0.0',
  })

  for (const tool of TOOL_REGISTRY) registerNotesTool(server, tool, allowedTools)
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[agentui-notes-mcp] ${message}\n`)
  process.exit(1)
})
