export type ConversationColor =
  | 'slate'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'stone'

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
  description?: string
  color?: ConversationColor | null
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
  contextWindow?: number
}

export type MemoryType = 'preference' | 'fact' | 'project' | 'instruction' | 'note'

export type SubagentMemoryScope = 'user' | 'project' | 'local' | 'none'

export type SdkMemoryScope = 'user' | 'project' | 'local' | 'auto'

export type MemoryDTO = {
  _id: string
  title: string
  content: string
  type: MemoryType
  tags: string[]
  sourceConversationId?: string
  sourceMessageId?: string
  usageCount: number
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export type CreateMemoryRequest = {
  title: string
  content: string
  type: MemoryType
  tags?: string[]
  sourceConversationId?: string
  sourceMessageId?: string
}

export type UpdateMemoryRequest = Partial<CreateMemoryRequest>

export type SdkMemoryFileDTO = {
  scope: SdkMemoryScope
  agentName?: string
  relativePath: string
  name: string
  size: number
  updatedAt: string
}

export type SdkMemoryAgentDTO = {
  agentName: string
  files: SdkMemoryFileDTO[]
}

export type SdkMemoryRootDTO = {
  scope: SdkMemoryScope
  label: string
  path: string
  exists: boolean
  agents: SdkMemoryAgentDTO[]
  files: SdkMemoryFileDTO[]
}

export type SdkMemoryListDTO = {
  roots: SdkMemoryRootDTO[]
}

export type SdkMemoryReadDTO = {
  scope: SdkMemoryScope
  agentName?: string
  relativePath: string
  content: string
  updatedAt: string
}

export type UpdateSdkMemoryFileRequest = {
  content: string
}

export type ContextBreakdown = {
  systemTokens: number
  toolTokens: number
  messageTokens: number
  fileTokens: number
}

export type ContextDTO = {
  usedTokens: number
  totalTokens: number
  model: string
  breakdown: ContextBreakdown
  recordedAt: string | null
}

export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export type LogSource = 'server' | 'renderer' | 'main'

export type LogEntryDTO = {
  id: string
  source: LogSource
  level: LogLevel
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}

export type ServerLogsDTO = {
  entries: LogEntryDTO[]
}

export type GitHubAuthDTO = {
  hasToken: boolean
}

export type GitHubLimitsDTO = {
  maxTreeEntries: number
  maxSelectedFiles: number
  maxRepositoryBytes: number
  maxFileBytes: number
  maxTotalTextBytes: number
  maxChunks: number
  maxContextChars: number
  chunkChars: number
  chunkOverlap: number
}

export type GitHubRepositoryDTO = {
  owner: string
  repo: string
  fullName: string
  repoUrl: string
  defaultBranch: string
  ref: string
  commitSha: string
  treeSha: string
  private: boolean
  treeTruncated: boolean
}

export type GitHubTreeEntryDTO = {
  path: string
  name: string
  parentPath: string
  type: 'file' | 'dir' | 'submodule'
  sha?: string
  size?: number
  language?: string
  selectedDefault: boolean
  skipped: boolean
  skipReason?: string
}

export type GitHubPreviewRequest = {
  url: string
  ref?: string
}

export type GitHubPreviewDTO = {
  repository: GitHubRepositoryDTO
  entries: GitHubTreeEntryDTO[]
  defaultSelectedPaths: string[]
  skippedCount: number
  limits: GitHubLimitsDTO
}

export type GitHubIngestRequest = {
  url: string
  ref?: string
  selectedPaths: string[]
}

export type GitHubIngestDTO = {
  sourceId: string
  repository: GitHubRepositoryDTO
  selectedFileCount: number
  ingestedFileCount: number
  chunkCount: number
  skipped: Array<{ path: string; reason: string }>
  errors: Array<{ path: string; message: string }>
  limits: GitHubLimitsDTO
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
  memory?: SubagentMemoryScope
  enabled: boolean
}

export type ModelClass = 'opus' | 'sonnet' | 'haiku'

export type SettingsDTO = {
  defaultModel: ModelClass
  /** Resolved latest model ID for the chosen class (e.g. "claude-opus-4-7"). */
  defaultModelId: string
  /** Send the context-1m-2025-08-07 beta on Sonnet 4 family turns. */
  useOneMillionContext: boolean
  /** Enable Claude Code fast mode on Opus family turns. */
  useFastMode: boolean
  /** Enable Claude Code auto-memory for this project. */
  autoMemoryEnabled: boolean
  /** Optional custom Claude Code auto-memory directory. */
  autoMemoryDirectory: string
  /** Enable Claude Code background memory consolidation. */
  autoDreamEnabled: boolean
}

export type ToolDTO = {
  id: string
  label?: string
  description: string
  enabled: boolean
  category?: string
  kind?: 'sdk' | 'mcp' | 'compatibility'
  order?: number
  quickRank?: number
  locked?: boolean
  permission?: string
}

export type HealthDTO = {
  db: 'up' | 'down'
  sdk: 'ready' | 'error'
}

export type UpdateConversationRequest = Partial<{
  title: string
  description: string
  color: ConversationColor | null
  effort: 'low' | 'medium' | 'high'
  attachedSkillIds: string[]
  attachedSubagentIds: string[]
}>

export type UpdateSettingsRequest = Partial<{
  defaultModel: SettingsDTO['defaultModel']
  useOneMillionContext: boolean
  useFastMode: boolean
  autoMemoryEnabled: boolean
  autoMemoryDirectory: string
  autoDreamEnabled: boolean
}>

export type UpdateToolRequest = Partial<{
  enabled: boolean
  description: string
}>

export type SSEEventName =
  | 'assistant'
  | 'result'
  | 'tool_use_summary'
  | 'tool_progress'
  | 'memory_recall'
  | 'error'

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

export type SSEMemoryRecallMemory = {
  path: string
  scope: string
  content?: string
}

export type SSEMemoryRecallPayload = {
  mode: 'select' | 'synthesize'
  memories: SSEMemoryRecallMemory[]
  raw?: unknown
}

export type TurnMode = 'plan' | 'research' | 'debug'

export type SendMessageRequest = {
  content: string
  modes?: TurnMode[]
}

export type CompressResponse = {
  status: 'ok'
  summaryMessageId: string
  archivedMessageCount: number
}

export type UsageWindow = '24h' | '7d' | '30d' | 'all'

export type UsageBucket = {
  spendUsd: number
  inTokens: number
  outTokens: number
  spark: number[]
  bucketStarts: string[]
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
  monthly: UsageBucket
  weekly: UsageBucket
  hourly: UsageBucket
  byModel: UsageByModelRow[]
  recentRuns: UsageRunRow[]
}
