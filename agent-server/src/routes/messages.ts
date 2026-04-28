import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { getOrCreateSession, isStreaming, markBusy, dropSession } from '../agent/session.ts'
import { openSSE } from '../agent/sse.ts'
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
    const entry = await getOrCreateSession(conversationId, conversation.model)
    await entry.session.send(content)

    for await (const message of entry.session.stream()) {
      if (res.writableEnded) break
      switch (message.type) {
        case 'assistant': {
          const text = (message.message?.content ?? [])
            .filter((b: { type?: string }) => b?.type === 'text')
            .map((b: { type?: string; text?: string }) => b.text ?? '')
            .join('')
          if (text) {
            await Message.create({ conversationId, role: 'assistant', content: text })
          }
          sse.write('assistant', { text, raw: message })
          break
        }
        case 'result': {
          const totalCost = (message as { total_cost_usd?: number }).total_cost_usd
          finalCost = totalCost
          if (typeof totalCost === 'number') {
            await Message.updateMany(
              { conversationId, role: 'assistant', costUsd: { $exists: false } },
              { $set: { costUsd: totalCost } },
            )
          }
          sse.write('result', { status: 'done', total_cost_usd: totalCost })
          break
        }
        case 'tool_use_summary': {
          const summary = (message as { summary?: unknown }).summary
          await Message.create({ conversationId, role: 'tool', content: { kind: 'summary', summary } })
          sse.write('tool_use_summary', { summary })
          break
        }
        case 'tool_progress': {
          const toolName = (message as { tool_name?: string }).tool_name ?? 'unknown'
          sse.write('tool_progress', { tool_name: toolName, raw: message })
          break
        }
        default:
          break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await Message.create({ conversationId, role: 'system', content: { kind: 'error', message } })
    sse.write('error', { message })
    sse.write('result', { status: 'error', error: message })
    dropSession(conversationId)
  } finally {
    markBusy(conversationId, false)
    sse.close()
    void finalCost
  }
})

export default router
