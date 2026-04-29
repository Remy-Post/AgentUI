import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { syncFromDb } from '../scaffold.ts'
import { Message } from '../../db/models/Message.ts'
import { Conversation } from '../../db/models/Conversation.ts'
import type { SSEHandle } from '../sse.ts'
import type { RuntimeConversation } from './options.ts'
import { buildQueryOptions } from './options.ts'
import { extractAssistantText, extractSessionId, normalizeSdkMessage } from './events.ts'
import {
  buildContextWindowBulkOps,
  buildTurnUsageBulkOps,
  type TurnUsageEntry,
} from './turnUsage.ts'

export type RunConversationTurnInput = {
  conversationId: string
  content: string
  conversation: RuntimeConversation
  sse: SSEHandle
  isClosed?: () => boolean
}

export type RunConversationTurnResult = {
  totalCostUsd?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCacheCreationInputTokens?: number
  totalCacheReadInputTokens?: number
}

async function persistSdkSessionIdOnce(
  conversationId: string,
  conversation: RuntimeConversation,
  message: SDKMessage,
): Promise<void> {
  if (conversation.sdkSessionId) return
  const sessionId = extractSessionId(message)
  if (!sessionId) return

  conversation.sdkSessionId = sessionId
  await Conversation.updateOne({ _id: conversationId }, { $set: { sdkSessionId: sessionId } })
}

function nz(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

type AssistantPersistResult = {
  entry?: TurnUsageEntry
}

async function persistAssistantMessage(
  conversationId: string,
  message: SDKAssistantMessage,
): Promise<AssistantPersistResult> {
  const text = extractAssistantText(message)
  if (!text) return {}

  const inner = message.message
  const usage = inner?.usage
  const isTopLevel = message.parent_tool_use_id == null
  const model = typeof inner?.model === 'string' ? inner.model : undefined

  const doc: Record<string, unknown> = { conversationId, role: 'assistant', content: text }

  if (isTopLevel) {
    if (typeof model === 'string') doc.model = model
    if (usage) {
      doc.inputTokens = nz(usage.input_tokens)
      doc.outputTokens = nz(usage.output_tokens)
      doc.cacheCreationInputTokens = nz(usage.cache_creation_input_tokens)
      doc.cacheReadInputTokens = nz(usage.cache_read_input_tokens)
    }
  }

  const created = await Message.create(doc)

  if (!isTopLevel) return {}
  const tokens = nz(usage?.input_tokens) + nz(usage?.output_tokens)
  return { entry: { id: created._id, tokens, model } }
}

export async function runConversationTurn({
  conversationId,
  content,
  conversation,
  sse,
  isClosed,
}: RunConversationTurnInput): Promise<RunConversationTurnResult> {
  await syncFromDb()
  const options = await buildQueryOptions(conversation, content)
  const stream = query({ prompt: content, options })
  const turnEntries: TurnUsageEntry[] = []
  let totalCostUsd: number | undefined
  let totalInputTokens: number | undefined
  let totalOutputTokens: number | undefined
  let totalCacheCreationInputTokens: number | undefined
  let totalCacheReadInputTokens: number | undefined

  try {
    for await (const message of stream) {
      if (isClosed?.()) break

      await persistSdkSessionIdOnce(conversationId, conversation, message)

      const event = normalizeSdkMessage(message)
      if (!event) continue

      switch (event.name) {
        case 'assistant': {
          if (message.type === 'assistant') {
            const { entry } = await persistAssistantMessage(conversationId, message)
            if (entry) turnEntries.push(entry)
          }
          sse.write('assistant', event.data)
          break
        }
        case 'result': {
          if (message.type === 'result') {
            const result = message as SDKResultMessage
            const cost = result.total_cost_usd
            const costOps =
              typeof cost === 'number' && Number.isFinite(cost)
                ? buildTurnUsageBulkOps(turnEntries, cost)
                : []
            if (typeof cost === 'number' && Number.isFinite(cost)) totalCostUsd = cost
            const contextOps = buildContextWindowBulkOps(turnEntries, result.modelUsage)
            const allOps = [...costOps, ...contextOps]
            if (allOps.length > 0) await Message.bulkWrite(allOps, { ordered: false })
            const usage = result.usage
            if (usage) {
              totalInputTokens = nz(usage.input_tokens)
              totalOutputTokens = nz(usage.output_tokens)
              totalCacheCreationInputTokens = nz(usage.cache_creation_input_tokens)
              totalCacheReadInputTokens = nz(usage.cache_read_input_tokens)
            }
          }
          sse.write('result', event.data)
          break
        }
        case 'tool_use_summary': {
          await Message.create({
            conversationId,
            role: 'tool',
            content: { kind: 'summary', summary: event.data.summary },
          })
          sse.write('tool_use_summary', event.data)
          break
        }
        case 'tool_progress':
          sse.write('tool_progress', event.data)
          break
        case 'error':
          sse.write('error', event.data)
          break
        default:
          break
      }
    }
  } finally {
    stream.close()
  }

  return {
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationInputTokens,
    totalCacheReadInputTokens,
  }
}
