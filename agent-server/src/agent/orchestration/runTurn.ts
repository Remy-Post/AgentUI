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
import type { TurnMode } from '../../shared/types.ts'
import { withGitHubContext } from '../../github/context.ts'
import type { RuntimeConversation } from './options.ts'
import { buildQueryOptions } from './options.ts'
import {
  extractAssistantText,
  extractSessionId,
  normalizeSdkMessage,
  type NormalizedStreamEvent,
} from './events.ts'
import {
  buildContextWindowBulkOps,
  buildTurnReconcileBulkOps,
  buildTurnUsageBulkOps,
  type TurnUsageEntry,
} from './turnUsage.ts'

export type RunConversationTurnInput = {
  conversationId: string
  content: string
  conversation: RuntimeConversation
  sse: SSEHandle
  isClosed?: () => boolean
  modes?: TurnMode[]
}

export type RunConversationTurnResult = {
  totalCostUsd?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCacheCreationInputTokens?: number
  totalCacheReadInputTokens?: number
}

export function writePassthroughEventToSse(
  event: NormalizedStreamEvent,
  sse: Pick<SSEHandle, 'write'>,
): boolean {
  switch (event.name) {
    case 'memory_recall':
      sse.write('memory_recall', event.data)
      return true
    default:
      return false
  }
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
  const inner = message.message
  const usage = inner?.usage
  const isTopLevel = message.parent_tool_use_id == null
  const model = typeof inner?.model === 'string' ? inner.model : undefined
  const text = extractAssistantText(message)

  // Sub-agent (nested) messages: only persist when there's display text;
  // otherwise we'd write empty assistant rows for every internal step.
  // Their tokens are absorbed into the turn-level reconcile delta.
  if (!isTopLevel) {
    if (!text) return {}
    await Message.create({ conversationId, role: 'assistant', content: text })
    return {}
  }

  // Top-level: persist a row even when text is empty (tool-use-only API call)
  // so that the turn's Message rows hold all the per-call usage data, which
  // is required for buildTurnReconcileBulkOps to land its $inc on a real id.
  const content: unknown = text || { kind: 'tool_use_only' }
  const doc: Record<string, unknown> = { conversationId, role: 'assistant', content }
  if (typeof model === 'string') doc.model = model

  const inputTokens = usage ? nz(usage.input_tokens) : 0
  const outputTokens = usage ? nz(usage.output_tokens) : 0
  const cacheCreationInputTokens = usage ? nz(usage.cache_creation_input_tokens) : 0
  const cacheReadInputTokens = usage ? nz(usage.cache_read_input_tokens) : 0

  if (usage) {
    doc.inputTokens = inputTokens
    doc.outputTokens = outputTokens
    doc.cacheCreationInputTokens = cacheCreationInputTokens
    doc.cacheReadInputTokens = cacheReadInputTokens
  }

  const created = await Message.create(doc)
  const tokens = inputTokens + outputTokens
  return {
    entry: {
      id: created._id,
      tokens,
      model,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
    },
  }
}

export async function runConversationTurn({
  conversationId,
  content,
  conversation,
  sse,
  isClosed,
  modes,
}: RunConversationTurnInput): Promise<RunConversationTurnResult> {
  await syncFromDb()
  const options = await buildQueryOptions(conversation, content, modes ?? [])
  const prompt = await withGitHubContext(conversationId, content)
  const stream = query({ prompt, options })
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

            const usage = result.usage
            const reconcileOps = usage
              ? (() => {
                  const inputTokens = nz(usage.input_tokens)
                  const outputTokens = nz(usage.output_tokens)
                  const cacheCreationInputTokens = nz(usage.cache_creation_input_tokens)
                  const cacheReadInputTokens = nz(usage.cache_read_input_tokens)

                  totalInputTokens = inputTokens
                  totalOutputTokens = outputTokens
                  totalCacheCreationInputTokens = cacheCreationInputTokens
                  totalCacheReadInputTokens = cacheReadInputTokens

                  return buildTurnReconcileBulkOps(turnEntries, {
                    inputTokens,
                    outputTokens,
                    cacheCreationInputTokens,
                    cacheReadInputTokens,
                  })
                })()
              : []

            const allOps = [...costOps, ...contextOps, ...reconcileOps]
            if (allOps.length > 0) await Message.bulkWrite(allOps, { ordered: false })

            // Edge case: a turn produced no top-level assistant entries but the
            // SDK still reports usage. Drop a synthetic accounting row so the
            // tokens show up in Finance aggregation. The renderer hides
            // content kinds tagged 'turn_usage'.
            const synthIn = totalInputTokens ?? 0
            const synthOut = totalOutputTokens ?? 0
            const synthCacheCreate = totalCacheCreationInputTokens ?? 0
            const synthCacheRead = totalCacheReadInputTokens ?? 0
            if (
              usage &&
              turnEntries.length === 0 &&
              synthIn + synthOut + synthCacheCreate + synthCacheRead > 0
            ) {
              await Message.create({
                conversationId,
                role: 'assistant',
                content: { kind: 'turn_usage' },
                inputTokens: synthIn,
                outputTokens: synthOut,
                cacheCreationInputTokens: synthCacheCreate,
                cacheReadInputTokens: synthCacheRead,
              })
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
        case 'memory_recall':
          writePassthroughEventToSse(event, sse)
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
