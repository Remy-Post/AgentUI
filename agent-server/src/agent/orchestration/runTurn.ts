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
  buildSyntheticTurnUsageFields,
  buildTurnAccountingBulkOps,
  normalizeUsageTotals,
  type TurnUsageTotals,
  type TurnUsageEntry,
} from './turnUsage.ts'
import { nz } from '../../util/numbers.ts'

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

type AssistantPersistResult = {
  entry?: TurnUsageEntry
}

export type AssistantPersistencePlan =
  | { kind: 'skip' }
  | { kind: 'nested_visible'; content: string }
  | { kind: 'top_level_visible'; content: string; model?: string }

export function planAssistantMessagePersistence(
  message: SDKAssistantMessage,
): AssistantPersistencePlan {
  const inner = message.message
  const isTopLevel = message.parent_tool_use_id == null
  const model = typeof inner?.model === 'string' ? inner.model : undefined
  const text = extractAssistantText(message)

  if (!text) return { kind: 'skip' }
  if (!isTopLevel) return { kind: 'nested_visible', content: text }
  return { kind: 'top_level_visible', content: text, model }
}

async function persistAssistantMessage(
  conversationId: string,
  message: SDKAssistantMessage,
): Promise<AssistantPersistResult> {
  const plan = planAssistantMessagePersistence(message)

  // Sub-agent (nested) messages: only persist when there's display text;
  // otherwise we'd write empty assistant rows for every internal step.
  // Their usage is covered by the SDK result totals stamped at turn end.
  if (plan.kind === 'nested_visible') {
    await Message.create({ conversationId, role: 'assistant', content: plan.content })
    return {}
  }

  // Top-level tool-use-only assistant events often repeat or partially report
  // usage. Keep them out of Mongo and stamp final result.usage on one visible
  // row at result time instead.
  if (plan.kind === 'skip') return {}

  const doc: Record<string, unknown> = {
    conversationId,
    role: 'assistant',
    content: plan.content,
  }
  if (typeof plan.model === 'string') doc.model = plan.model

  const created = await Message.create(doc)
  return {
    entry: {
      id: created._id,
      model: plan.model,
    },
  }
}

function usageTotalsFromResult(usage: SDKResultMessage['usage'] | undefined): Required<TurnUsageTotals> | null {
  if (!usage) return null
  return normalizeUsageTotals({
    inputTokens: nz(usage.input_tokens),
    outputTokens: nz(usage.output_tokens),
    cacheCreationInputTokens: nz(usage.cache_creation_input_tokens),
    cacheReadInputTokens: nz(usage.cache_read_input_tokens),
  })
}

function resultCost(result: SDKResultMessage): number | undefined {
  const cost = result.total_cost_usd
  return typeof cost === 'number' && Number.isFinite(cost) ? Math.max(0, cost) : undefined
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
            const cost = resultCost(result)
            if (cost !== undefined) totalCostUsd = cost

            const usageTotals = usageTotalsFromResult(result.usage)
            if (usageTotals) {
              totalInputTokens = usageTotals.inputTokens
              totalOutputTokens = usageTotals.outputTokens
              totalCacheCreationInputTokens = usageTotals.cacheCreationInputTokens
              totalCacheReadInputTokens = usageTotals.cacheReadInputTokens
            }

            if (usageTotals || cost !== undefined) {
              const allOps = buildTurnAccountingBulkOps(
                turnEntries,
                usageTotals ?? {},
                cost,
                result.modelUsage,
              )
              if (allOps.length > 0) await Message.bulkWrite(allOps, { ordered: false })
            }

            // Edge case: a turn produced no visible top-level assistant row but
            // the SDK still reports usage/cost. Drop a synthetic accounting row
            // so the tokens show up in Finance aggregation. The renderer hides
            // content kinds tagged 'turn_usage'.
            const syntheticUsage = buildSyntheticTurnUsageFields(
              conversation.model,
              usageTotals ?? undefined,
              cost,
              result.modelUsage,
            )
            if (turnEntries.length === 0 && syntheticUsage) {
              await Message.create({
                conversationId,
                role: 'assistant',
                ...syntheticUsage,
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
