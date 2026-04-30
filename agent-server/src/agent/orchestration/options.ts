import type { Options } from '@anthropic-ai/claude-agent-sdk'
import mongoose from 'mongoose'
import { protectSensitiveFiles } from '../../../util/hooks.ts'
import {
  ONE_MILLION_CONTEXT_BETA,
  modelSupportsFastMode,
  modelSupportsOneMillionContext,
} from '../../../util/vars.ts'
import { Settings } from '../../db/models/Settings.ts'
import { Skill } from '../../db/models/Skill.ts'
import { Subagent } from '../../db/models/Subagent.ts'
import { Tool } from '../../db/models/Tool.ts'
import { uniqueGoogleWorkspaceServices } from '../../mcp/gwsTypes.ts'
import type { TurnMode } from '../../shared/types.ts'
import { ensureToolRegistrySeeded } from './defaultTools.ts'
import {
  PLAN_MODE_INSTRUCTIONS,
  buildAgentDefinitions,
  ORCHESTRATOR_AGENT_NAME,
  type RuntimeSubagentRecord,
} from './agents.ts'
import { ensureTurnSubagents } from './dynamicSubagents.ts'
import { makeToolPermissionPolicy, resolveToolPolicy, type ToolRecord } from './toolPolicy.ts'

export type RuntimeConversation = {
  _id: unknown
  model: string
  sdkSessionId?: string
  effort?: 'low' | 'medium' | 'high'
  attachedSkillIds?: string[]
  attachedSubagentIds?: string[]
}

export type RuntimeSkillRecord = {
  _id?: unknown
  name: string
  enabled?: boolean
}

export type RuntimeConfig = {
  tools: ToolRecord[]
  subagents: RuntimeSubagentRecord[]
  skills: RuntimeSkillRecord[]
  useOneMillionContext: boolean
  useFastMode: boolean
  autoMemoryEnabled: boolean
  autoMemoryDirectory: string
  autoDreamEnabled: boolean
}

function idString(value: unknown): string {
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  if (typeof value === 'object' && value && 'toString' in value) return String(value)
  return typeof value === 'string' ? value : ''
}

function filterAttached<T extends { _id?: unknown; name: string }>(records: T[], attachedIds?: string[]): T[] {
  if (!attachedIds || attachedIds.length === 0) return records
  const wanted = new Set(attachedIds)
  return records.filter((record) => wanted.has(idString(record._id)) || wanted.has(record.name))
}

export async function loadRuntimeConfig(conversation: RuntimeConversation): Promise<RuntimeConfig> {
  await ensureToolRegistrySeeded()

  const [tools, subagents, skills, settingsDoc] = await Promise.all([
    Tool.find().lean(),
    Subagent.find({ enabled: true }).lean(),
    Skill.find({ enabled: true }).lean(),
    Settings.findOne({ key: 'global' }).lean<{
      useOneMillionContext?: boolean
      useFastMode?: boolean
      autoMemoryEnabled?: boolean
      autoMemoryDirectory?: string
      autoDreamEnabled?: boolean
    } | null>(),
  ])

  return {
    tools: tools.map((tool) => ({ id: String(tool.id), enabled: tool.enabled !== false })),
    subagents: filterAttached(
      subagents.map((subagent) => ({
        _id: subagent._id,
        name: String(subagent.name),
        description: String(subagent.description),
        prompt: String(subagent.prompt),
        model: typeof subagent.model === 'string' ? subagent.model : undefined,
        effort: typeof subagent.effort === 'string' ? subagent.effort : undefined,
        permissionMode: typeof subagent.permissionMode === 'string' ? subagent.permissionMode : undefined,
        tools: Array.isArray(subagent.tools) ? subagent.tools.filter((tool): tool is string => typeof tool === 'string') : undefined,
        disallowedTools: Array.isArray(subagent.disallowedTools)
          ? subagent.disallowedTools.filter((tool): tool is string => typeof tool === 'string')
          : undefined,
        mcpServices: Array.isArray(subagent.mcpServices)
          ? uniqueGoogleWorkspaceServices(
            subagent.mcpServices.filter((service): service is string => typeof service === 'string'),
          )
          : undefined,
        memory:
          subagent.memory === 'user'
          || subagent.memory === 'project'
          || subagent.memory === 'local'
          || subagent.memory === 'none'
            ? subagent.memory
            : undefined,
      })),
      conversation.attachedSubagentIds,
    ),
    skills: filterAttached(
      skills.map((skill) => ({
        _id: skill._id,
        name: String(skill.name),
        enabled: skill.enabled !== false,
      })),
      conversation.attachedSkillIds,
    ),
    useOneMillionContext: Boolean(settingsDoc?.useOneMillionContext),
    useFastMode: Boolean(settingsDoc?.useFastMode),
    autoMemoryEnabled: settingsDoc?.autoMemoryEnabled !== false,
    autoMemoryDirectory:
      typeof settingsDoc?.autoMemoryDirectory === 'string' ? settingsDoc.autoMemoryDirectory : '',
    autoDreamEnabled: Boolean(settingsDoc?.autoDreamEnabled),
  }
}

export function buildSdkSettings(runtime: RuntimeConfig, fastModeActive: boolean): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    autoMemoryEnabled: runtime.autoMemoryEnabled !== false,
    autoDreamEnabled: Boolean(runtime.autoDreamEnabled),
  }
  const autoMemoryDirectory = runtime.autoMemoryDirectory.trim()
  if (autoMemoryDirectory) settings.autoMemoryDirectory = autoMemoryDirectory
  if (fastModeActive) settings.fastMode = true
  return settings
}

export function buildQueryOptionsFromRuntime(
  conversation: RuntimeConversation,
  runtime: RuntimeConfig,
  modes: TurnMode[] = [],
): Options {
  const policy = resolveToolPolicy(runtime.tools)
  const skillNames = runtime.skills.map((skill) => skill.name).filter(Boolean)
  const oneMActive = runtime.useOneMillionContext && modelSupportsOneMillionContext(conversation.model)
  const fastModeActive = runtime.useFastMode && modelSupportsFastMode(conversation.model)
  const planActive = modes.includes('plan')

  return {
    model: conversation.model,
    agent: ORCHESTRATOR_AGENT_NAME,
    agents: buildAgentDefinitions(policy, runtime.subagents, conversation.effort, modes),
    tools: policy.availableTools,
    allowedTools: policy.allowedTools,
    disallowedTools: policy.disallowedTools,
    canUseTool: makeToolPermissionPolicy(policy),
    permissionMode: planActive ? 'plan' : 'dontAsk',
    planModeInstructions: planActive ? PLAN_MODE_INSTRUCTIONS : undefined,
    settingSources: ['project'],
    betas: oneMActive ? [ONE_MILLION_CONTEXT_BETA] : undefined,
    settings: buildSdkSettings(runtime, fastModeActive),
    hooks: {
      PreToolUse: [
        {
          matcher: '.*',
          hooks: [protectSensitiveFiles],
        },
      ],
    },
    skills: skillNames.length > 0 ? skillNames : undefined,
    resume: conversation.sdkSessionId || undefined,
    agentProgressSummaries: true,
    forwardSubagentText: false,
  }
}

export async function buildQueryOptions(
  conversation: RuntimeConversation,
  content: string,
  modes: TurnMode[] = [],
): Promise<Options> {
  const runtime = await loadRuntimeConfig(conversation)
  const policy = resolveToolPolicy(runtime.tools)
  const subagents = await ensureTurnSubagents(content, conversation, runtime.subagents, policy)
  return buildQueryOptionsFromRuntime(conversation, { ...runtime, subagents }, modes)
}
