import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import {
  type GoogleWorkspaceService,
  googleWorkspaceServiceFromToolId,
  isGoogleWorkspaceToolId,
} from '../../mcp/gwsTypes.ts'
import { DB_MCP_TOOL_TO_TOGGLE, type DbToolId, isDbToolId } from '../../mcp/dbTypes.ts'

export type ToolRecord = {
  id: string
  enabled: boolean
}

export type RuntimeToolPolicy = {
  availableTools: string[]
  allowedTools: string[]
  disallowedTools: string[]
  enabledToolIds: Set<string>
  enabledSdkTools: Set<string>
  enabledWorkspaceServices: Set<GoogleWorkspaceService>
  enabledDbToolIds: Set<DbToolId>
}

const AGENT_TOOL = 'Agent'

export const UI_TOOL_TO_SDK_TOOLS: Record<string, string[]> = {
  Agent: ['Agent'],
  AskUserQuestion: ['AskUserQuestion'],
  Bash: ['Bash'],
  CronCreate: ['CronCreate'],
  CronDelete: ['CronDelete'],
  CronList: ['CronList'],
  Edit: ['Edit'],
  EnterPlanMode: ['EnterPlanMode'],
  EnterWorktree: ['EnterWorktree'],
  ExitPlanMode: ['ExitPlanMode'],
  ExitWorktree: ['ExitWorktree'],
  Glob: ['Glob'],
  Grep: ['Grep'],
  ListMcpResourcesTool: ['ListMcpResourcesTool'],
  LSP: ['LSP'],
  Monitor: ['Monitor'],
  MultiEdit: ['MultiEdit'],
  NotebookEdit: ['NotebookEdit'],
  PowerShell: ['PowerShell'],
  Read: ['Read'],
  ReadMcpResourceTool: ['ReadMcpResourceTool'],
  SendMessage: ['SendMessage'],
  Skill: ['Skill'],
  TaskCreate: ['TaskCreate'],
  TaskGet: ['TaskGet'],
  TaskList: ['TaskList'],
  TaskOutput: ['TaskOutput'],
  TaskStop: ['TaskStop'],
  TaskUpdate: ['TaskUpdate'],
  TeamCreate: ['TeamCreate'],
  TeamDelete: ['TeamDelete'],
  TodoWrite: ['TodoWrite'],
  ToolSearch: ['ToolSearch'],
  WebFetch: ['WebFetch'],
  WebSearch: ['WebSearch'],
  Write: ['Write'],
  read_file: ['Read'],
  edit_file: ['Edit', 'Write', 'MultiEdit'],
  grep: ['Grep'],
  list_files: ['Glob'],
  'shell.exec': ['Bash'],
  'web.fetch': ['WebFetch'],
  'web.search': ['WebSearch'],
  'git.commit': [],
  'sqlite.query': [],
}

const KNOWN_SDK_TOOLS = [
  'Agent',
  'AskUserQuestion',
  'CronCreate',
  'CronDelete',
  'CronList',
  'EnterPlanMode',
  'EnterWorktree',
  'ExitPlanMode',
  'ExitWorktree',
  'ListMcpResourcesTool',
  'LSP',
  'Monitor',
  'PowerShell',
  'ReadMcpResourceTool',
  'SendMessage',
  'Skill',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'TeamCreate',
  'TeamDelete',
  'TodoWrite',
  'ToolSearch',
  'Read',
  'Edit',
  'Write',
  'MultiEdit',
  'Grep',
  'Glob',
  'Bash',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
]

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch'])

const FORBIDDEN_BASH_PATTERNS: RegExp[] = [
  /\brm\s+-[^\n\r;|&]*[rf]/i,
  /\bRemove-Item\b[^\n\r;|&]*\s-(?:Recurse|r)\b/i,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[^\n\r;|&]*f|push|commit|tag|rebase)\b/i,
  /\b(?:npm|pnpm|yarn)\s+publish\b/i,
  /\bcurl\b[^\n\r]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b/i,
  /\b(?:shutdown|reboot)\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\brmdir\s+\/[sq]\b/i,
]

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

export function expandToolNames(toolNames: Iterable<string> | undefined): string[] {
  if (!toolNames) return []

  const expanded: string[] = []
  for (const name of toolNames) {
    if (isGoogleWorkspaceToolId(name)) continue
    if (isDbToolId(name)) continue
    const mapped = UI_TOOL_TO_SDK_TOOLS[name]
    if (mapped) expanded.push(...mapped)
    else if (name) expanded.push(name)
  }
  return unique(expanded)
}

export function resolveToolPolicy(tools: ToolRecord[]): RuntimeToolPolicy {
  const enabledToolIds = new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.id))
  const enabledSdkTools = new Set(expandToolNames(enabledToolIds))
  enabledSdkTools.add(AGENT_TOOL)
  const enabledWorkspaceServices = new Set(
    tools
      .filter((tool) => tool.enabled)
      .map((tool) => googleWorkspaceServiceFromToolId(tool.id))
      .filter((service): service is GoogleWorkspaceService => service !== null),
  )
  const enabledDbToolIds = new Set(
    tools
      .filter((tool) => tool.enabled && isDbToolId(tool.id))
      .map((tool) => tool.id as DbToolId),
  )
  const disabledSdkTools = new Set(
    tools.flatMap((tool) => (tool.enabled ? [] : expandToolNames([tool.id]))),
  )

  const availableTools = unique([AGENT_TOOL, ...enabledSdkTools])
  const allowedTools = unique(availableTools)
  const disallowedTools = unique(
    KNOWN_SDK_TOOLS.filter((tool) => tool !== AGENT_TOOL && (!enabledSdkTools.has(tool) || disabledSdkTools.has(tool))),
  )

  return {
    availableTools,
    allowedTools,
    disallowedTools,
    enabledToolIds,
    enabledSdkTools,
    enabledWorkspaceServices,
    enabledDbToolIds,
  }
}

export function filterEnabledSdkTools(toolNames: Iterable<string>, policy: RuntimeToolPolicy): string[] {
  return unique(expandToolNames(toolNames).filter((tool) => policy.enabledSdkTools.has(tool)))
}

export function filterEnabledWorkspaceServices(
  services: Iterable<string> | undefined,
  policy: RuntimeToolPolicy,
): GoogleWorkspaceService[] {
  const out: GoogleWorkspaceService[] = []
  const seen = new Set<GoogleWorkspaceService>()
  for (const service of services ?? []) {
    if (!policy.enabledWorkspaceServices.has(service as GoogleWorkspaceService)) continue
    const workspaceService = service as GoogleWorkspaceService
    if (seen.has(workspaceService)) continue
    seen.add(workspaceService)
    out.push(workspaceService)
  }
  return out
}

export function filterEnabledDbToolIds(
  toolIds: Iterable<string> | undefined,
  policy: RuntimeToolPolicy,
): DbToolId[] {
  const out: DbToolId[] = []
  const seen = new Set<DbToolId>()
  for (const toolId of toolIds ?? []) {
    if (!isDbToolId(toolId) || !policy.enabledDbToolIds.has(toolId) || seen.has(toolId)) continue
    seen.add(toolId)
    out.push(toolId)
  }
  return out
}

export function isSensitiveToolPath(input: Record<string, unknown>): boolean {
  const paths = [
    input.file_path,
    input.path,
    input.notebook_path,
    input.command,
  ].filter((value): value is string => typeof value === 'string')

  return paths.some((value) => /(^|[/\\])\.env(?:$|[.\s/\\])/i.test(value) || value.includes('.env'))
}

export function isForbiddenBashInput(input: Record<string, unknown>): boolean {
  const command = typeof input.command === 'string' ? input.command : ''
  if (!command) return false
  return FORBIDDEN_BASH_PATTERNS.some((pattern) => pattern.test(command))
}

function googleWorkspaceServiceFromMcpTool(toolName: string): GoogleWorkspaceService | null {
  const match = /^mcp__agentui_gws_[A-Za-z0-9_]+__gws_(drive|gmail|calendar|sheets|docs|tasks)_call$/.exec(toolName)
  return match?.[1] as GoogleWorkspaceService | null
}

function isGoogleWorkspaceSchemaMcpTool(toolName: string): boolean {
  return /^mcp__agentui_gws_[A-Za-z0-9_]+__gws_schema$/.test(toolName)
}

function dbToolIdFromMcpTool(toolName: string): DbToolId | null {
  const match = /^mcp__agentui_db__([A-Za-z0-9_]+)$/.exec(toolName)
  if (!match) return null
  return DB_MCP_TOOL_TO_TOGGLE[match[1]] ?? null
}

function allow(toolUseID?: string): PermissionResult {
  return { behavior: 'allow', toolUseID }
}

function deny(message: string, toolUseID?: string): PermissionResult {
  return { behavior: 'deny', message, toolUseID }
}

export function makeToolPermissionPolicy(policy: RuntimeToolPolicy): CanUseTool {
  return async (toolName, input, options) => {
    const isSubagent = typeof options.agentID === 'string' && options.agentID.length > 0

    if (toolName === AGENT_TOOL) {
      return isSubagent
        ? deny('Nested subagent delegation is disabled by the global safety policy.', options.toolUseID)
        : allow(options.toolUseID)
    }

    if (!isSubagent) {
      return deny('The parent orchestrator may only delegate through the Agent tool.', options.toolUseID)
    }

    const workspaceService = googleWorkspaceServiceFromMcpTool(toolName)
    if (workspaceService) {
      return policy.enabledWorkspaceServices.has(workspaceService)
        ? allow(options.toolUseID)
        : deny(`Google Workspace ${workspaceService} access is disabled.`, options.toolUseID)
    }

    if (isGoogleWorkspaceSchemaMcpTool(toolName)) {
      return policy.enabledWorkspaceServices.size > 0
        ? allow(options.toolUseID)
        : deny('Google Workspace access is disabled.', options.toolUseID)
    }

    const dbToolId = dbToolIdFromMcpTool(toolName)
    if (dbToolId) {
      return policy.enabledDbToolIds.has(dbToolId)
        ? allow(options.toolUseID)
        : deny(`Database tool ${dbToolId} is disabled.`, options.toolUseID)
    }

    if (!policy.enabledSdkTools.has(toolName)) {
      return deny(`Tool ${toolName} is disabled by the AgentUI tool policy.`, options.toolUseID)
    }

    if (isSensitiveToolPath(input)) {
      return deny('Cannot access or modify sensitive environment files.', options.toolUseID)
    }

    if (WRITE_TOOLS.has(toolName)) {
      return allow(options.toolUseID)
    }

    if (toolName === 'Bash') {
      if (isForbiddenBashInput(input)) {
        return deny('This shell command is blocked by the global safety policy.', options.toolUseID)
      }
      return allow(options.toolUseID)
    }

    if (WEB_TOOLS.has(toolName)) return allow(options.toolUseID)
    return allow(options.toolUseID)
  }
}

export const AGENT_TOOL_NAME = AGENT_TOOL
