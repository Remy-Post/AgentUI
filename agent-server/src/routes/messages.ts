import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { isStreaming, markBusy, dropSession } from '../agent/session.ts'
import { openSSE } from '../agent/sse.ts'
import { runConversationTurn } from '../agent/orchestration/runTurn.ts'
import type { SendMessageRequest, TurnMode } from '../shared/types.ts'

const TURN_MODE_VALUES: TurnMode[] = ['plan', 'research', 'debug']

function parseModes(value: unknown): TurnMode[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<TurnMode>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    if ((TURN_MODE_VALUES as string[]).includes(entry)) seen.add(entry as TurnMode)
  }
  return [...seen]
}

const router = Router({ mergeParams: true })

// POST /api/sessions/:id/messages -> SSE stream of SDK events for this turn.
// Persists the user message immediately and assistant/tool messages as they stream.
router.post<'/', { id: string }>('/', async (req, res) => {
  const conversationId = req.params.id
  if (!mongoose.isValidObjectId(conversationId)) {
    return res.status(400).json({ error: 'invalid_id' })
  }
  const conversation = await Conversation.findById(conversationId)
  if (!conversation) return res.status(404).json({ error: 'not_found' })

  if (isStreaming(conversationId)) {
    return res.status(409).json({ error: 'stream_in_progress' })
  }

  const body = (req.body ?? {}) as SendMessageRequest
  const content = (body.content ?? '').toString()
  if (!content.trim()) return res.status(400).json({ error: 'empty_content' })
  const modes = parseModes(body.modes)

  await Message.create({ conversationId, role: 'user', content })
  await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } })

  markBusy(conversationId, true)
  const sse = openSSE(res)
  let turnResult: Awaited<ReturnType<typeof runConversationTurn>> | undefined

  try {
    turnResult = await runConversationTurn({
      conversationId,
      content,
      conversation,
      sse,
      isClosed: () => res.writableEnded,
      modes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await Message.create({ conversationId, role: 'system', content: { kind: 'error', message } })
    sse.write('error', { message })
    sse.write('result', { status: 'error', error: message })
    dropSession(conversationId)
  } finally {
    markBusy(conversationId, false)
    sse.close()
    if (turnResult && typeof turnResult.totalCostUsd === 'number') {
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $inc: {
            totalCostUsd: turnResult.totalCostUsd,
            totalInputTokens: turnResult.totalInputTokens ?? 0,
            totalOutputTokens: turnResult.totalOutputTokens ?? 0,
            totalCacheCreationInputTokens: turnResult.totalCacheCreationInputTokens ?? 0,
            totalCacheReadInputTokens: turnResult.totalCacheReadInputTokens ?? 0,
          },
        },
      )
    }
  }
})

export default router
