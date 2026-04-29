import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { syncFromDb } from '../scaffold.ts'
import { Message } from '../../db/models/Message.ts'
import { Conversation } from '../../db/models/Conversation.ts'
import type { SSEHandle } from '../sse.ts'
import type { RuntimeConversation } from './options.ts'
import { buildQueryOptions } from './options.ts'
import { extractAssistantText, extractSessionId, normalizeSdkMessage } from './events.ts'

export type RunConversationTurnInput = {
  conversationId: string
  content: string
  conversation: RuntimeConversation
  sse: SSEHandle
  isClosed?: () => boolean
}

export type RunConversationTurnResult = {
  totalCostUsd?: number
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

export async function runConversationTurn({
  conversationId,
  content,
  conversation,
  sse,
  isClosed,
}: RunConversationTurnInput): Promise<RunConversationTurnResult> {
  await syncFromDb()
  const options = await buildQueryOptions(conversation)
  const stream = query({ prompt: content, options })
  let totalCostUsd: number | undefined

  try {
    for await (const message of stream) {
      if (isClosed?.()) break

      await persistSdkSessionIdOnce(conversationId, conversation, message)

      const event = normalizeSdkMessage(message)
      if (!event) continue

      switch (event.name) {
        case 'assistant': {
          const text = extractAssistantText(message)
          if (text) {
            await Message.create({ conversationId, role: 'assistant', content: text })
          }
          sse.write('assistant', event.data)
          break
        }
        case 'result': {
          const cost = (event.data as { total_cost_usd?: unknown }).total_cost_usd
          if (typeof cost === 'number') {
            totalCostUsd = cost
            await Message.updateMany(
              { conversationId, role: 'assistant', costUsd: { $exists: false } },
              { $set: { costUsd: cost } },
            )
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

  return { totalCostUsd }
}
