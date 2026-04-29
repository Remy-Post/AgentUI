export type ConversationDTO = {
  _id: string
  title: string
  model: string
  sdkSessionId?: string
  totalCostUsd?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCacheCreationInputTokens?: number
  totalCacheReadInputTokens?: number
  effort?: 'low' | 'medium' | 'high'
  attachedSkillIds?: string[]
  attachedSubagentIds?: string[]
  createdAt: string
  updatedAt: string
}

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system'

export type MessageDTO = {
  _id: string
  conversationId: string
  role: MessageRole
  content: unknown
  createdAt: string
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  model?: string
}

export type SkillDTO = {
  _id: string
  name: string
  description: string
  body: string
  parameters?: Record<string, unknown>
  enabled: boolean
}

export type SubagentDTO = {
  _id: string
  name: string
  description: string
  prompt: string
  model?: string
  effort?: string
  permissionMode?: string
  tools?: string[]
  disallowedTools?: string[]
  mcpServices?: Array<'drive' | 'gmail' | 'calendar' | 'sheets' | 'docs' | 'tasks'>
  enabled: boolean
}

export type SettingsDTO = {
  defaultModel: 'claude-sonnet-4' | 'claude-opus-4' | 'claude-haiku-4-5'
}

export type ToolDTO = {
  id: string
  description: string
  enabled: boolean
}

export type HealthDTO = {
  db: 'up' | 'down'
  sdk: 'ready' | 'error'
}

export type UpdateConversationRequest = Partial<{
  title: string
  effort: 'low' | 'medium' | 'high'
  attachedSkillIds: string[]
  attachedSubagentIds: string[]
}>

export type UpdateSettingsRequest = Partial<{
  defaultModel: SettingsDTO['defaultModel']
}>

export type UpdateToolRequest = Partial<{
  enabled: boolean
  description: string
}>

export type SSEEventName = 'assistant' | 'result' | 'tool_use_summary' | 'tool_progress' | 'error'

export type SSEAssistantPayload = {
  text: string
  raw?: unknown
}

export type SSEResultPayload = {
  status: 'done' | 'error'
  total_cost_usd?: number
  error?: string
}

export type SSEToolUseSummaryPayload = {
  summary: unknown
}

export type SSEToolProgressPayload = {
  tool_name: string
  raw?: unknown
}

export type SendMessageRequest = {
  content: string
}

export type UsageWindow = '24h' | '7d' | '30d' | 'all'

export type UsageBucket = {
  spendUsd: number
  inTokens: number
  outTokens: number
  spark: number[]
}

export type UsageByModelRow = {
  model: string
  inTokens: number
  outTokens: number
  spendUsd: number
}

export type UsageRunRow = {
  id: string
  title: string
  model: string
  tokens: number
  spendUsd: number
}

export type UsageDTO = {
  totals: UsageBucket
  today: UsageBucket
  lastHour: UsageBucket
  byModel: UsageByModelRow[]
  recentRuns: UsageRunRow[]
}
