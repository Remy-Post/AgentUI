import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentDefinition, PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { GoogleWorkspaceService } from '../../mcp/gwsTypes.ts'
import type { DbToolId } from '../../mcp/dbTypes.ts'
import {
  NOTES_MCP_TOOL_TO_TOGGLE,
  type NotesToolId,
  uniqueNotesToolIds,
} from '../../mcp/notesTypes.ts'
import type { TurnMode } from '../../shared/types.ts'
import type { RuntimeToolPolicy } from './toolPolicy.ts'
import {
  AGENT_TOOL_NAME,
  expandToolNames,
  filterEnabledDbToolIds,
  filterEnabledNotesToolIds,
  filterEnabledSdkTools,
  filterEnabledWorkspaceServices,
} from './toolPolicy.ts'

export const ORCHESTRATOR_AGENT_NAME = 'agentui_orchestrator'

export const PLAN_MODE_INSTRUCTIONS = [
  'Run the planning pipeline below before producing the final plan. Use the Agent tool to spawn scoped subagents in parallel wherever possible.',
  '',
  '1. ASK: If any aspect of the request is ambiguous, missing required context, or unsafe, ask one concise clarification question and stop. Otherwise skip this step.',
  '2. RESEARCH: Spawn multiple research subagents in parallel, each scoped to one source (e.g. one per relevant area of the codebase, one per external doc set, one for the open web). Each subagent returns concise findings, citations, and gaps.',
  '3. ANALYZE: Read the research returns. If the picture is incomplete or contradictory, spawn additional research subagents to close specific gaps. Loop ANALYZE -> RESEARCH until you have enough information to commit to a plan.',
  '4. CREATE PLAN: Draft a concrete implementation plan: scope, files to change, sequence, risks, verification.',
  '5. REVIEW PLAN: Spawn a dedicated review subagent. Give it the original request and the plan. It returns: PASS, or a list of concrete issues. If it returns issues, revise the plan and re-review. Loop until the review subagent returns PASS.',
  '6. PRESENT: Call ExitPlanMode with the approved plan as the final answer.',
  '',
  'Hard rules:',
  '- Spawn many subagents rather than one broad worker. One subagent = one source or one question.',
  '- Do not edit files or run side-effecting tools. Investigation only.',
  '- Do not skip the REVIEW PLAN loop. The plan is not final until a review subagent passes it.',
].join('\n')

const RESEARCH_MODE_ADDENDUM = [
  '',
  '== RESEARCH MODE ==',
  'The user wants a deep investigation of the request, not a one-shot answer.',
  'Spawn multiple research subagents in parallel: one per source angle (codebase area, external docs, web). Use WebSearch and WebFetch heavily for any external angle.',
  'After subagents return, aggregate into a structured in-depth summary with these sections: Findings, Sources, Contradictions / Open Questions, Recommendations.',
  'Do not skip web sources unless the user explicitly says the work is purely internal.',
].join('\n')

const DEBUG_MODE_ADDENDUM = [
  '',
  '== DEBUG MODE ==',
  'Surface your reasoning for the user. Before the final answer, include a short trace covering: which subagents you spawned and why, what each returned, and which path you chose. Keep the trace tight; it should aid debugging, not bury the answer.',
].join('\n')

export function composeOrchestratorPrompt(modes: TurnMode[] = []): string {
  let prompt = ORCHESTRATOR_PROMPT
  if (modes.includes('research')) prompt += RESEARCH_MODE_ADDENDUM
  if (modes.includes('debug')) prompt += DEBUG_MODE_ADDENDUM
  return prompt
}

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
  memory?: 'user' | 'project' | 'local' | 'none'
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

function asMemoryScope(value: string | undefined): AgentDefinition['memory'] | undefined {
  if (value === 'user' || value === 'project' || value === 'local') return value
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

function notesServerScriptPath(): string {
  return mcpServerScriptPath('notesServer')
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

function notesServerArgs(): string[] {
  return mcpServerArgs(notesServerScriptPath())
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

function buildNotesMcpEnv(toolIds: NotesToolId[]): Record<string, string> {
  const env: Record<string, string> = {
    ...buildBaseMcpEnv(),
    AGENTUI_NOTES_ALLOWED_TOOLS: toolIds.join(','),
  }
  const mongodbUri = envValue('MONGODB_URI')
  if (mongodbUri) env.MONGODB_URI = mongodbUri
  return env
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

function buildNotesMcpServers(toolIds: NotesToolId[]): {
  mcpServers?: NonNullable<AgentDefinition['mcpServers']>
  allowedTools: string[]
} {
  if (toolIds.length === 0) return { allowedTools: [] }
  const enabled = new Set(toolIds)
  const allowedTools = Object.entries(NOTES_MCP_TOOL_TO_TOGGLE)
    .filter(([, toolId]) => enabled.has(toolId))
    .map(([toolName]) => `mcp__agentui_notes__${toolName}`)

  return {
    mcpServers: [
      {
        agentui_notes: {
          type: 'stdio',
          command: process.execPath,
          args: notesServerArgs(),
          env: buildNotesMcpEnv(toolIds),
        },
      },
    ],
    allowedTools,
  }
}

function notesToolIdsForSubagent(
  source: RuntimeSubagentRecord,
  policy: RuntimeToolPolicy,
): NotesToolId[] {
  const requested = uniqueNotesToolIds(source.tools)
  if (Array.isArray(source.tools)) {
    return requested.length > 0 ? filterEnabledNotesToolIds(requested, policy) : []
  }
  return Array.from(policy.enabledNotesToolIds)
}

function buildSubagentDefinition(
  source: RuntimeSubagentRecord,
  policy: RuntimeToolPolicy,
  effortOverride?: AgentDefinition['effort'],
): AgentDefinition {
  const tools = filterEnabledSdkTools(source.tools ?? [], policy)
  const mcpServices = filterEnabledWorkspaceServices(source.mcpServices, policy)
  const dbToolIds = filterEnabledDbToolIds(source.tools, policy)
  const notesToolIds = notesToolIdsForSubagent(source, policy)
  const mcp = buildGwsMcpServers(mcpServices)
  const dbMcp = buildDbMcpServers(dbToolIds)
  const notesMcp = buildNotesMcpServers(notesToolIds)
  const mcpServers = [...(mcp.mcpServers ?? []), ...(dbMcp.mcpServers ?? []), ...(notesMcp.mcpServers ?? [])]
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
    memory: asMemoryScope(source.memory),
    tools: unique([...tools, ...mcp.allowedTools, ...dbMcp.allowedTools, ...notesMcp.allowedTools]),
    disallowedTools,
    mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
  }
}

export function buildAgentDefinitions(
  policy: RuntimeToolPolicy,
  mongoSubagents: RuntimeSubagentRecord[],
  conversationEffort?: 'low' | 'medium' | 'high',
  modes: TurnMode[] = [],
): Record<string, AgentDefinition> {
  const effort = mapConversationEffort(conversationEffort)
  const agents: Record<string, AgentDefinition> = {
    [ORCHESTRATOR_AGENT_NAME]: {
      description: 'Minimal parent orchestrator that delegates tool-heavy work to scoped subagents.',
      prompt: composeOrchestratorPrompt(modes),
      permissionMode: modes.includes('plan') ? 'plan' : 'dontAsk',
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
