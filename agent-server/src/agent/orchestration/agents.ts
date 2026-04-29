import type { AgentDefinition, PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { RuntimeToolPolicy } from './toolPolicy.ts'
import { AGENT_TOOL_NAME, expandToolNames, filterEnabledSdkTools } from './toolPolicy.ts'

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
}

const SAFE_RESEARCH_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']

const HIDDEN_RUNTIME_AGENTS: RuntimeSubagentRecord[] = [
  {
    name: 'runtime_researcher',
    description: 'Explores files and web context, then reports concise findings.',
    prompt: [
      'You are a scoped research subagent for AgentUI.',
      'Use only the context and task you are given.',
      'Search, inspect, and summarize facts that help the parent answer.',
      'Do not edit files or perform side effects.',
      'Return concise findings, relevant paths, and any uncertainty.',
    ].join('\n'),
    model: 'claude-sonnet-4',
    effort: 'medium',
    permissionMode: 'dontAsk',
    tools: SAFE_RESEARCH_TOOLS,
  },
  {
    name: 'runtime_code_worker',
    description: 'Performs narrowly scoped code inspection or safe file edits.',
    prompt: [
      'You are a scoped code-work subagent for AgentUI.',
      'Work only on the task and files explicitly relevant to your prompt.',
      'Prefer small targeted edits and report changed paths.',
      'Do not run destructive shell commands or touch sensitive files.',
      'Return a concise implementation summary and verification notes.',
    ].join('\n'),
    model: 'claude-sonnet-4',
    effort: 'medium',
    permissionMode: 'dontAsk',
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit'],
  },
  {
    name: 'runtime_test_runner',
    description: 'Runs targeted checks and reports failures concisely.',
    prompt: [
      'You are a scoped test-running subagent for AgentUI.',
      'Run only checks that are relevant to the delegated task.',
      'Avoid long-running or destructive commands.',
      'Return command names, pass/fail status, and the shortest useful failure details.',
    ].join('\n'),
    model: 'claude-haiku-4-5-20251001',
    effort: 'low',
    permissionMode: 'dontAsk',
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
  },
  {
    name: 'runtime_automation_worker',
    description: 'Handles scoped personal automation or external lookup tasks.',
    prompt: [
      'You are a scoped automation subagent for AgentUI.',
      'Use web and shell tools only when they are explicitly needed and allowed.',
      'Avoid irreversible external side effects.',
      'Return actions taken, results, and any blocked unsafe operation.',
    ].join('\n'),
    model: 'claude-sonnet-4',
    effort: 'medium',
    permissionMode: 'dontAsk',
    tools: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Bash'],
  },
]

const ORCHESTRATOR_PROMPT = [
  'You are the AgentUI parent orchestrator.',
  'Your primary job is intent understanding, decomposition, delegation, and aggregation.',
  'You have minimal direct tool access. Use the Agent tool for any tool-heavy work.',
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

function buildSubagentDefinition(
  source: RuntimeSubagentRecord,
  policy: RuntimeToolPolicy,
): AgentDefinition {
  const requestedTools = source.tools && source.tools.length > 0 ? source.tools : SAFE_RESEARCH_TOOLS
  const tools = filterEnabledSdkTools(requestedTools, policy)
  const disallowedTools = [
    ...policy.disallowedTools,
    ...expandToolNames(source.disallowedTools),
    AGENT_TOOL_NAME,
  ]

  return {
    description: source.description,
    prompt: source.prompt,
    model: source.model,
    effort: asEffort(source.effort),
    permissionMode: asPermissionMode(source.permissionMode),
    tools,
    disallowedTools,
  }
}

export function buildAgentDefinitions(
  policy: RuntimeToolPolicy,
  mongoSubagents: RuntimeSubagentRecord[],
): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {
    [ORCHESTRATOR_AGENT_NAME]: {
      description: 'Minimal parent orchestrator that delegates tool-heavy work to scoped subagents.',
      prompt: ORCHESTRATOR_PROMPT,
      permissionMode: 'dontAsk',
      tools: [AGENT_TOOL_NAME],
      disallowedTools: policy.availableTools.filter((tool) => tool !== AGENT_TOOL_NAME),
    },
  }

  const used = new Set(Object.keys(agents))
  for (const source of [...HIDDEN_RUNTIME_AGENTS, ...mongoSubagents]) {
    const fallback = `subagent_${used.size}`
    let key = normalizeAgentKey(source.name, fallback)
    let suffix = 2
    while (used.has(key)) {
      key = `${normalizeAgentKey(source.name, fallback)}_${suffix}`
      suffix += 1
    }
    used.add(key)
    agents[key] = buildSubagentDefinition(source, policy)
  }

  return agents
}
