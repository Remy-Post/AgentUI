import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  executeGwsCall,
  executeGwsSchema,
  GwsCommandError,
  GwsCallInputShape,
  GwsSchemaInputShape,
} from './gwsCommand.ts'
import {
  GOOGLE_WORKSPACE_SERVICES,
  type GoogleWorkspaceService,
  parseAllowedGoogleWorkspaceServices,
} from './gwsTypes.ts'

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
  if (error instanceof GwsCommandError) {
    return toolResult({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        exitCode: error.exitCode,
      },
      stdout: error.stdout || undefined,
      stderr: error.stderr || undefined,
    }, true)
  }

  if (error instanceof Error) {
    return toolResult({ ok: false, error: { code: 'internal_failure', message: error.message } }, true)
  }

  return toolResult({ ok: false, error: { code: 'internal_failure', message: 'Unknown gws wrapper error.' } }, true)
}

function registerSchemaTool(server: McpServer, allowedServices: GoogleWorkspaceService[]): void {
  server.registerTool(
    'gws_schema',
    {
      title: 'Google Workspace API schema',
      description: 'Inspect the request and response schema for an allowed Google Workspace API method.',
      inputSchema: GwsSchemaInputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        const result = await executeGwsSchema(input, { allowedServices })
        return toolResult({ ok: true, ...result })
      } catch (error) {
        return errorResult(error)
      }
    },
  )
}

function registerServiceTool(
  server: McpServer,
  service: GoogleWorkspaceService,
  allowedServices: GoogleWorkspaceService[],
): void {
  server.registerTool(
    `gws_${service}_call`,
    {
      title: `Google Workspace ${service} call`,
      description: `Call an allowed ${service} API method through gws using structured resource, method, params, and body fields.`,
      inputSchema: GwsCallInputShape,
      annotations: { openWorldHint: true },
    },
    async (input) => {
      try {
        const result = await executeGwsCall(service, input, { allowedServices })
        return toolResult({ ok: true, service, ...result })
      } catch (error) {
        return errorResult(error)
      }
    },
  )
}

async function main(): Promise<void> {
  const allowedServices = parseAllowedGoogleWorkspaceServices(process.env.GWS_ALLOWED_SERVICES)
  const server = new McpServer({
    name: 'agentui-google-workspace',
    version: '1.0.0',
  })

  if (allowedServices.length > 0) registerSchemaTool(server, allowedServices)
  for (const service of GOOGLE_WORKSPACE_SERVICES) {
    if (allowedServices.includes(service)) registerServiceTool(server, service, allowedServices)
  }

  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[agentui-gws-mcp] ${message}\n`)
  process.exit(1)
})
