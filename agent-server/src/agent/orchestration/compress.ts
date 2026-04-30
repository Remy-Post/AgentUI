import { query, type HookCallback, type HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'
import { Conversation } from '../../db/models/Conversation.ts'
import { Message } from '../../db/models/Message.ts'
import { dropSession } from '../session.ts'

type CompressInput = {
  conversationId: string
  conversationModel: string
  sdkSessionId: string
}

export type CompressResult = {
  summary: string
  archivedMessageCount: number
  summaryMessageId: string
  preTokens?: number
  postTokens?: number
}

type CompactBoundary = {
  type: 'system'
  subtype: 'compact_boundary'
  compact_metadata: {
    trigger: 'manual' | 'auto'
    pre_tokens: number
    post_tokens?: number
    duration_ms?: number
  }
}

function isCompactBoundary(message: unknown): message is CompactBoundary {
  if (!message || typeof message !== 'object') return false
  const m = message as { type?: unknown; subtype?: unknown }
  return m.type === 'system' && m.subtype === 'compact_boundary'
}

export async function compressConversation({
  conversationId,
  conversationModel,
  sdkSessionId,
}: CompressInput): Promise<CompressResult> {
  let summary = ''
  let preTokens: number | undefined
  let postTokens: number | undefined

  const capturePostCompact: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name === 'PostCompact') {
      summary = input.compact_summary
    }
    return {}
  }

  const stream = query({
    prompt: '/compact',
    options: {
      model: conversationModel,
      resume: sdkSessionId,
      settingSources: ['project'],
      permissionMode: 'dontAsk',
      hooks: {
        PostCompact: [{ hooks: [capturePostCompact] }],
      },
    },
  })

  try {
    for await (const message of stream) {
      if (isCompactBoundary(message)) {
        preTokens = message.compact_metadata.pre_tokens
        postTokens = message.compact_metadata.post_tokens
      }
    }
  } finally {
    stream.close()
  }

  if (!summary.trim()) throw new Error('compress_empty_summary')

  const archivedCount = await Message.countDocuments({ conversationId })
  const created = await Message.create({
    conversationId,
    role: 'system',
    content: {
      kind: 'compaction',
      summary: summary.trim(),
      archivedCount,
      preTokens,
      postTokens,
    },
  })

  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { updatedAt: new Date() } },
  )
  dropSession(conversationId)

  return {
    summary: summary.trim(),
    archivedMessageCount: archivedCount,
    summaryMessageId: String(created._id),
    preTokens,
    postTokens,
  }
}
