import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { isStreaming, markBusy, dropSession } from '../agent/session.ts'
import { openSSE } from '../agent/sse.ts'
import { runConversationTurn } from '../agent/orchestration/runTurn.ts'
import type { SendMessageRequest } from '../shared/types.ts'

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

  await Message.create({ conversationId, role: 'user', content })
  await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } })

  markBusy(conversationId, true)
  const sse = openSSE(res)
  let finalCost: number | undefined

  try {
    const result = await runConversationTurn({
      conversationId,
      content,
      conversation,
      sse,
      isClosed: () => res.writableEnded,
    })
    finalCost = result.totalCostUsd
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await Message.create({ conversationId, role: 'system', content: { kind: 'error', message } })
    sse.write('error', { message })
    sse.write('result', { status: 'error', error: message })
    dropSession(conversationId)
  } finally {
    markBusy(conversationId, false)
    sse.close()
    if (typeof finalCost === 'number') {
      await Conversation.updateOne(
        { _id: conversationId },
        { $inc: { totalCostUsd: finalCost } },
      )
    }
  }
})

export default router
