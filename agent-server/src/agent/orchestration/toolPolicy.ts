import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'

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
}

const AGENT_TOOL = 'Agent'

export const UI_TOOL_TO_SDK_TOOLS: Record<string, string[]> = {
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

const AUTO_ALLOWED_TOOLS = new Set(['Agent', 'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])
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
    const mapped = UI_TOOL_TO_SDK_TOOLS[name]
    if (mapped) expanded.push(...mapped)
    else if (name) expanded.push(name)
  }
  return unique(expanded)
}

export function resolveToolPolicy(tools: ToolRecord[]): RuntimeToolPolicy {
  const enabledToolIds = new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.id))
  const enabledSdkTools = new Set(expandToolNames(enabledToolIds))
  const disabledSdkTools = new Set(
    tools.flatMap((tool) => (tool.enabled ? [] : expandToolNames([tool.id]))),
  )

  const availableTools = unique([AGENT_TOOL, ...enabledSdkTools])
  const allowedTools = unique(
    availableTools.filter((tool) => AUTO_ALLOWED_TOOLS.has(tool) || (tool === 'Bash' && enabledSdkTools.has('Bash'))),
  )
  const disallowedTools = unique(
    KNOWN_SDK_TOOLS.filter((tool) => !enabledSdkTools.has(tool) || disabledSdkTools.has(tool)),
  )

  return {
    availableTools,
    allowedTools,
    disallowedTools,
    enabledToolIds,
    enabledSdkTools,
  }
}

export function filterEnabledSdkTools(toolNames: Iterable<string>, policy: RuntimeToolPolicy): string[] {
  return unique(expandToolNames(toolNames).filter((tool) => policy.enabledSdkTools.has(tool)))
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

    if (!policy.enabledSdkTools.has(toolName)) {
      return deny(`Tool ${toolName} is disabled by the AgentUI tool policy.`, options.toolUseID)
    }

    if (isSensitiveToolPath(input)) {
      return deny('Cannot access or modify sensitive environment files.', options.toolUseID)
    }

    if (WRITE_TOOLS.has(toolName)) {
      return policy.enabledToolIds.has('edit_file')
        ? allow(options.toolUseID)
        : deny('File editing tools are disabled.', options.toolUseID)
    }

    if (toolName === 'Bash') {
      if (!policy.enabledToolIds.has('shell.exec')) {
        return deny('Shell execution is disabled.', options.toolUseID)
      }
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
