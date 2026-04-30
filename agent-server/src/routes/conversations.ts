import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { Tool } from '../db/models/Tool.ts'
import { Settings } from '../db/models/Settings.ts'
import { GitHubRepositoryChunk } from '../db/models/GitHubRepositoryChunk.ts'
import { GitHubRepositorySource } from '../db/models/GitHubRepositorySource.ts'
import { dropSession, isStreaming } from '../agent/session.ts'
import { compressConversation } from '../agent/orchestration/compress.ts'
import { ensureToolRegistrySeeded } from '../agent/orchestration/defaultTools.ts'
import { normalizeModelClass, resolveContextWindow, resolveLatestModelId } from '../../util/vars.ts'
import { nz } from '../util/numbers.ts'
import type { CompressResponse, ContextDTO } from '../shared/types.ts'

const router = Router()

const EFFORT_VALUES = ['low', 'medium', 'high'] as const
type Effort = (typeof EFFORT_VALUES)[number]

const COLOR_VALUES = ['slate', 'sky', 'emerald', 'amber', 'rose', 'violet', 'stone'] as const
type Color = (typeof COLOR_VALUES)[number]

function isConversationColor(value: unknown): value is Color {
  return typeof value === 'string' && COLOR_VALUES.includes(value as Color)
}

router.get('/', async (_req, res) => {
  const docs = await Conversation.find().sort({ updatedAt: -1 }).lean()
  res.json(docs)
})

router.post('/', async (req, res) => {
  const { title, model } = req.body ?? {}
  let resolvedModel: string | undefined = typeof model === 'string' && model.length > 0 ? model : undefined
  const settingsDoc = await Settings.findOne({ key: 'global' })
    .lean<{ defaultModel?: string; defaultChatColor?: string | null } | null>()
  if (!resolvedModel) {
    resolvedModel = resolveLatestModelId(normalizeModelClass(settingsDoc?.defaultModel))
  }
  const doc = await Conversation.create({
    title: title ?? 'New conversation',
    model: resolvedModel,
    color: isConversationColor(settingsDoc?.defaultChatColor) ? settingsDoc.defaultChatColor : null,
  })
  res.status(201).json(doc)
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Conversation.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(doc)
})

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const trimmed = body.title.trim()
    if (trimmed.length < 4) return res.status(400).json({ error: 'title_too_short' })
    update.title = trimmed
  }
  if (typeof body.description === 'string') {
    const trimmed = body.description.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    if (words !== 0 && (words < 10 || words > 500)) {
      return res.status(400).json({ error: 'description_word_count' })
    }
    update.description = body.description
  }
  if ('color' in body) {
    if (body.color === null) {
      update.color = null
    } else if (typeof body.color === 'string') {
      if (!isConversationColor(body.color)) {
        return res.status(400).json({ error: 'invalid_color' })
      }
      update.color = body.color
    } else {
      return res.status(400).json({ error: 'invalid_color' })
    }
  }
  if (typeof body.effort === 'string') {
    if (!EFFORT_VALUES.includes(body.effort as Effort)) {
      return res.status(400).json({ error: 'invalid_effort' })
    }
    update.effort = body.effort
  }
  if (Array.isArray(body.attachedSkillIds) && body.attachedSkillIds.every((s) => typeof s === 'string')) {
    update.attachedSkillIds = body.attachedSkillIds
  }
  if (Array.isArray(body.attachedSubagentIds) && body.attachedSubagentIds.every((s) => typeof s === 'string')) {
    update.attachedSubagentIds = body.attachedSubagentIds
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'no_op' })

  const doc = await Conversation.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(doc)
})

router.post('/:id/compress', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const conversation = await Conversation.findById(req.params.id).lean<{
    model?: string
    sdkSessionId?: string
  } | null>()
  if (!conversation) return res.status(404).json({ error: 'not_found' })
  if (isStreaming(req.params.id)) return res.status(409).json({ error: 'stream_in_progress' })
  const model = typeof conversation.model === 'string' ? conversation.model : ''
  if (!model) return res.status(400).json({ error: 'no_model' })
  const sdkSessionId = typeof conversation.sdkSessionId === 'string' ? conversation.sdkSessionId : ''
  if (!sdkSessionId) return res.status(400).json({ error: 'no_sdk_session' })

  try {
    const result = await compressConversation({
      conversationId: req.params.id,
      conversationModel: model,
      sdkSessionId,
    })
    const dto: CompressResponse = {
      status: 'ok',
      summaryMessageId: result.summaryMessageId,
      archivedMessageCount: result.archivedMessageCount,
    }
    return res.json(dto)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'compress_failed'
    return res.status(500).json({ error: message })
  }
})

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  await Promise.all([
    Conversation.deleteOne({ _id: req.params.id }),
    Message.deleteMany({ conversationId: req.params.id }),
    GitHubRepositoryChunk.deleteMany({ conversationId: req.params.id }),
    GitHubRepositorySource.deleteMany({ conversationId: req.params.id }),
  ])
  dropSession(req.params.id)
  return res.status(204).end()
})

router.get('/:id/messages', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const docs = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean()
  return res.json(docs)
})

// Context window state for a single conversation. The "used" total is taken
// from the most recent top-level assistant message's BetaUsage (since it
// reflects what the SDK just sent to the model). The breakdown attempts to
// attribute that volume to the categories the wireframe shows: system prompt
// is approximated from the first turn's cacheCreationInputTokens (which on
// turn one is dominated by system+tools+initial user msg), tools is
// estimated from enabled-tool count, GitHub repository chunks are approximated
// from stored character counts, and messages are the remainder.
//
// Context-window source of truth: result.modelUsage[model].contextWindow,
// captured per top-level assistant message at result time. The per-model
// fallback in util/vars.ts is only used when the conversation has no
// recorded turns yet (resolveContextWindow keys off the conversation's
// selected model so the icon shows the correct cap before the first turn).
// The 1M context beta is enabled per Settings and only when options.ts says
// the selected model family supports it; otherwise models use their API default.
// Each tool definition (name + description + JSON schema) costs ~150 tokens
// in the request payload. This is an order-of-magnitude estimate; varies
// with schema complexity but stays in the right ballpark.
const TOKENS_PER_TOOL_DEF = 150
// First user message is usually short; we subtract a token-equivalent of
// ~50 from the first-turn cacheCreation to leave system+tools.
const FIRST_USER_MSG_ESTIMATE_TOKENS = 50

function pickContextWindow(
  model: string,
  recorded: number | null,
  useOneMillionContext: boolean,
): number {
  if (typeof recorded === 'number' && recorded > 0) return recorded
  return resolveContextWindow(model, { useOneMillionContext })
}

router.get('/:id/context', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })

  const conversation = await Conversation.findById(req.params.id).lean<{
    model?: string
  } | null>()
  if (!conversation) return res.status(404).json({ error: 'not_found' })

  await ensureToolRegistrySeeded()

  // Top-level assistant rows are the ones we wrote per-message tokens on.
  // We treat presence of inputTokens as the marker; subagent inner turns
  // were never tagged with token fields by runTurn.
  const tokenedFilter = {
    conversationId: req.params.id,
    role: 'assistant',
    inputTokens: { $exists: true },
  }

  const [latest, first, enabledToolCount, settingsDoc, githubChunkTotals] = await Promise.all([
    Message.findOne(tokenedFilter)
      .sort({ createdAt: -1 })
      .lean<{
        inputTokens?: number
        outputTokens?: number
        cacheCreationInputTokens?: number
        cacheReadInputTokens?: number
        model?: string
        contextWindow?: number
        createdAt?: Date
      } | null>(),
    Message.findOne(tokenedFilter)
      .sort({ createdAt: 1 })
      .lean<{ cacheCreationInputTokens?: number } | null>(),
    Tool.countDocuments({ enabled: true }),
    Settings.findOne({ key: 'global' }).lean<{ useOneMillionContext?: boolean } | null>(),
    GitHubRepositoryChunk.aggregate<{ chars: number }>([
      { $match: { conversationId: new mongoose.Types.ObjectId(req.params.id) } },
      { $group: { _id: null, chars: { $sum: '$charCount' } } },
    ]),
  ])

  const conversationModel = typeof conversation.model === 'string' ? conversation.model : 'unknown'
  const model = latest?.model ?? conversationModel
  const useOneMillionContext = Boolean(settingsDoc?.useOneMillionContext)
  const totalTokens = pickContextWindow(model, nz(latest?.contextWindow) || null, useOneMillionContext)

  // Used = current input volume + last response. The four BetaUsage fields
  // capture both the cached and the fresh portion of the latest model call.
  const usedTokens = latest
    ? nz(latest.inputTokens) +
      nz(latest.cacheCreationInputTokens) +
      nz(latest.cacheReadInputTokens) +
      nz(latest.outputTokens)
    : 0

  const toolTokens = Math.max(0, enabledToolCount * TOKENS_PER_TOOL_DEF)
  const firstCacheCreation = nz(first?.cacheCreationInputTokens)
  const systemTokens = Math.max(
    0,
    firstCacheCreation - toolTokens - FIRST_USER_MSG_ESTIMATE_TOKENS,
  )
  const fileChars = githubChunkTotals[0]?.chars ?? 0
  const fileTokens = Math.ceil(fileChars / 4)
  const messageTokens = Math.max(0, usedTokens - systemTokens - toolTokens - fileTokens)

  const dto: ContextDTO = {
    usedTokens,
    totalTokens,
    model,
    breakdown: {
      systemTokens,
      toolTokens,
      messageTokens,
      fileTokens,
    },
    recordedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
  }
  return res.json(dto)
})

export default router
