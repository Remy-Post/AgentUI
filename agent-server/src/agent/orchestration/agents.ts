import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentDefinition, PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { GoogleWorkspaceService } from '../../mcp/gwsTypes.ts'
import type { DbToolId } from '../../mcp/dbTypes.ts'
import type { RuntimeToolPolicy } from './toolPolicy.ts'
import {
  AGENT_TOOL_NAME,
  expandToolNames,
  filterEnabledDbToolIds,
  filterEnabledSdkTools,
  filterEnabledWorkspaceServices,
} from './toolPolicy.ts'

export const ORCHESTRATOR_AGENT_NAME = 'agentui_orchestrator'

export type RuntimeSubagentRecord = {
  _id?: unknown
  name: string
  description: string
  prompt: string
  model?: string
  effort?: string
  permissionMode?: string
  tools?: string[]
  disallowedTools?: string[]
  mcpServices?: GoogleWorkspaceService[]
}

const ORCHESTRATOR_PROMPT = [
  'You are the AgentUI parent orchestrator.',
  'Your primary job is intent understanding, decomposition, delegation, and aggregation.',
  'You have minimal direct tool access. Use the Agent tool for any tool-heavy work.',
  'Use one subagent for exactly one clear purpose or problem.',
  'When there are multiple distinct issues, delegate them to multiple scoped subagents rather than one broad worker.',
  'Use only the subagents made available for this turn; they were selected or created from MongoDB for this request.',
  'Spawn zero subagents only for simple answers, clarification questions, or tasks that do not need tools.',
  'When delegating, give each subagent a scoped task, minimal necessary context, expected output, and safety constraints.',
  'Ask a concise clarification question when the request is ambiguous, unsafe, or missing required context.',
  'Aggregate subagent results into one useful response. Do not expose internal orchestration details unless they help the user.',
].join('\n')

function normalizeAgentKey(name: string, fallback: string): string {
  const normalized = name.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function asPermissionMode(value: string | undefined): PermissionMode {
  if (
    value === 'default'
    || value === 'acceptEdits'
    || value === 'plan'
    || value === 'dontAsk'
    || value === 'auto'
  ) {
    return value
  }
  return 'dontAsk'
}

function asEffort(value: string | undefined): AgentDefinition['effort'] | undefined {
  if (
    value === 'low'
    || value === 'medium'
    || value === 'high'
    || value === 'xhigh'
    || value === 'max'
  ) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function mapConversationEffort(
  value: 'low' | 'medium' | 'high' | undefined,
): AgentDefinition['effort'] {
  if (value === 'low') return 'low'
  if (value === 'high') return 'max'
  return 'high'
}

function unique(values: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function gwsServerScriptPath(): string {
  return mcpServerScriptPath('gwsServer')
}

function dbServerScriptPath(): string {
  return mcpServerScriptPath('dbServer')
}

function mcpServerScriptPath(name: string): string {
  const thisFile = fileURLToPath(import.meta.url)
  const extension = thisFile.endsWith('.ts') ? 'ts' : 'js'
  return resolve(dirname(thisFile), '..', '..', 'mcp', `${name}.${extension}`)
}

function mcpServerArgs(scriptPath: string): string[] {
  if (scriptPath.endsWith('.ts')) return ['--import', 'tsx', scriptPath]
  return [scriptPath]
}

function gwsServerArgs(): string[] {
  return mcpServerArgs(gwsServerScriptPath())
}

function dbServerArgs(): string[] {
  return mcpServerArgs(dbServerScriptPath())
}

function envValue(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const MCP_BASE_ENV_NAMES = [
  'SystemRoot',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
]

function pathEnvName(): 'PATH' | 'Path' {
  return process.platform === 'win32' ? 'Path' : 'PATH'
}

function withNodeBinPaths(pathValue: string | undefined): string {
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const current = pathValue ?? ''
  const nodeBinPaths = unique([
    resolve(process.cwd(), 'node_modules', '.bin'),
    resolve(process.cwd(), '..', 'node_modules', '.bin'),
    resolve(dirname(gwsServerScriptPath()), '..', '..', '..', 'node_modules', '.bin'),
  ])
  return unique([...nodeBinPaths, ...current.split(delimiter).filter(Boolean)]).join(delimiter)
}

function buildBaseMcpEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const name of MCP_BASE_ENV_NAMES) {
    const value = envValue(name)
    if (value) env[name] = value
  }

  const pathName = pathEnvName()
  env[pathName] = withNodeBinPaths(process.env[pathName] ?? process.env.PATH)
  if (process.platform === 'win32') {
    const pathext = envValue('PATHEXT')
    if (pathext) env.PATHEXT = pathext
  }

  return env
}

function buildGwsMcpEnv(services: GoogleWorkspaceService[]): Record<string, string> {
  const env = buildBaseMcpEnv()
  const copyEnvNames = [
    'GOOGLE_WORKSPACE_CLI_CONFIG_DIR',
    'GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE',
    'GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND',
    'GOOGLE_WORKSPACE_PROJECT_ID',
  ]

  for (const name of copyEnvNames) {
    const value = envValue(name)
    if (value) env[name] = value
  }

  const binaryPath = envValue('GWS_BINARY_PATH')
  if (binaryPath) env.GWS_BINARY_PATH = binaryPath

  env.GWS_ALLOWED_SERVICES = services.join(',')
  return env
}

function buildDbMcpEnv(toolIds: DbToolId[]): Record<string, string> {
  return {
    ...buildBaseMcpEnv(),
    AGENTUI_DB_ALLOWED_TOOLS: toolIds.join(','),
  }
}

function gwsMcpServerName(services: GoogleWorkspaceService[]): string {
  return `agentui_gws_${services.join('_')}`
}

function buildGwsMcpServers(services: GoogleWorkspaceService[]): {
  mcpServers?: NonNullable<AgentDefinition['mcpServers']>
  allowedTools: string[]
} {
  if (services.length === 0) return { allowedTools: [] }
  const serverName = gwsMcpServerName(services)
  return {
    mcpServers: [
      {
        [serverName]: {
          type: 'stdio',
          command: process.execPath,
          args: gwsServerArgs(),
          env: buildGwsMcpEnv(services),
        },
      },
    ],
    allowedTools: [`mcp__${serverName}__*`],
  }
}

function buildDbMcpServers(toolIds: DbToolId[]): {
  mcpServers?: NonNullable<AgentDefinition['mcpServers']>
  allowedTools: string[]
} {
  if (toolIds.length === 0) return { allowedTools: [] }
  return {
    mcpServers: [
      {
        agentui_db: {
          type: 'stdio',
          command: process.execPath,
          args: dbServerArgs(),
          env: buildDbMcpEnv(toolIds),
        },
      },
    ],
    allowedTools: ['mcp__agentui_db__*'],
  }
}

function buildSubagentDefinition(
  source: RuntimeSubagentRecord,
  policy: RuntimeToolPolicy,
  effortOverride?: AgentDefinition['effort'],
): AgentDefinition {
  const tools = filterEnabledSdkTools(source.tools ?? [], policy)
  const mcpServices = filterEnabledWorkspaceServices(source.mcpServices, policy)
  const dbToolIds = filterEnabledDbToolIds(source.tools, policy)
  const mcp = buildGwsMcpServers(mcpServices)
  const dbMcp = buildDbMcpServers(dbToolIds)
  const mcpServers = [...(mcp.mcpServers ?? []), ...(dbMcp.mcpServers ?? [])]
  const disallowedTools = [
    ...policy.disallowedTools,
    ...expandToolNames(source.disallowedTools),
    AGENT_TOOL_NAME,
  ]

  return {
    description: source.description,
    prompt: source.prompt,
    model: source.model,
    effort: effortOverride ?? asEffort(source.effort),
    permissionMode: asPermissionMode(source.permissionMode),
    tools: unique([...tools, ...mcp.allowedTools, ...dbMcp.allowedTools]),
    disallowedTools,
    mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
  }
}

export function buildAgentDefinitions(
  policy: RuntimeToolPolicy,
  mongoSubagents: RuntimeSubagentRecord[],
  conversationEffort?: 'low' | 'medium' | 'high',
): Record<string, AgentDefinition> {
  const effort = mapConversationEffort(conversationEffort)
  const agents: Record<string, AgentDefinition> = {
    [ORCHESTRATOR_AGENT_NAME]: {
      description: 'Minimal parent orchestrator that delegates tool-heavy work to scoped subagents.',
      prompt: ORCHESTRATOR_PROMPT,
      permissionMode: 'dontAsk',
      effort,
      tools: [AGENT_TOOL_NAME],
      disallowedTools: policy.availableTools.filter((tool) => tool !== AGENT_TOOL_NAME),
    },
  }

  const used = new Set(Object.keys(agents))
  for (const source of mongoSubagents) {
    const fallback = `subagent_${used.size}`
    let key = normalizeAgentKey(source.name, fallback)
    let suffix = 2
    while (used.has(key)) {
      key = `${normalizeAgentKey(source.name, fallback)}_${suffix}`
      suffix += 1
    }
    used.add(key)
    agents[key] = buildSubagentDefinition(source, policy, effort)
  }

  return agents
}
