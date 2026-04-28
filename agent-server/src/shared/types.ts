export type ConversationDTO = {
  _id: string
  title: string
  model: string
  totalCostUsd?: number
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
  enabled: boolean
}

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
