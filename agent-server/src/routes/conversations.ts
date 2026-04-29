import { Router } from 'express'
import mongoose from 'mongoose'
import { Conversation } from '../db/models/Conversation.ts'
import { Message } from '../db/models/Message.ts'
import { Tool } from '../db/models/Tool.ts'
import { Settings } from '../db/models/Settings.ts'
import { dropSession } from '../agent/session.ts'
import { normalizeModelClass, resolveContextWindow, resolveLatestModelId } from '../../util/vars.ts'
import type { ContextDTO } from '../shared/types.ts'

const router = Router()

router.get('/', async (_req, res) => {
  const docs = await Conversation.find().sort({ updatedAt: -1 }).lean()
  res.json(docs)
})

router.post('/', async (req, res) => {
  const { title, model } = req.body ?? {}
  let resolvedModel: string | undefined = typeof model === 'string' && model.length > 0 ? model : undefined
  if (!resolvedModel) {
    const settingsDoc = await Settings.findOne({ key: 'global' })
      .lean<{ defaultModel?: string } | null>()
    resolvedModel = resolveLatestModelId(normalizeModelClass(settingsDoc?.defaultModel))
  }
  const doc = await Conversation.create({
    title: title ?? 'New conversation',
    model: resolvedModel,
  })
  res.status(201).json(doc)
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const doc = await Conversation.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ error: 'not_found' })
  return res.json(doc)
})

const EFFORT_VALUES = ['low', 'medium', 'high'] as const
type Effort = (typeof EFFORT_VALUES)[number]

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title
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

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'invalid_id' })
  await Promise.all([
    Conversation.deleteOne({ _id: req.params.id }),
    Message.deleteMany({ conversationId: req.params.id }),
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
// estimated from enabled-tool count, messages is the remainder, and files
// is zero because AgentUI does not yet support attachments.
//
// Context-window source of truth: result.modelUsage[model].contextWindow,
// captured per top-level assistant message at result time. The per-model
// fallback in util/vars.ts is only used when the conversation has no
// recorded turns yet (resolveContextWindow keys off the conversation's
// selected model so the icon shows the correct cap before the first turn).
// AgentUI does not enable the SdkBeta 'context-1m-2025-08-07' header
// (see options.ts), so Sonnet 4.6 / Opus 4.7 run at their 200k default;
// to extend them to 1M, enable the beta in SDK options and bump the
// matching entries in MODEL_CONTEXT_WINDOWS.
// Each tool definition (name + description + JSON schema) costs ~150 tokens
// in the request payload. This is an order-of-magnitude estimate; varies
// with schema complexity but stays in the right ballpark.
const TOKENS_PER_TOOL_DEF = 150
// First user message is usually short; we subtract a token-equivalent of
// ~50 from the first-turn cacheCreation to leave system+tools.
const FIRST_USER_MSG_ESTIMATE_TOKENS = 50

function nz(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

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

  // Top-level assistant rows are the ones we wrote per-message tokens on.
  // We treat presence of inputTokens as the marker; subagent inner turns
  // were never tagged with token fields by runTurn.
  const tokenedFilter = {
    conversationId: req.params.id,
    role: 'assistant',
    inputTokens: { $exists: true },
  }

  const [latest, first, enabledToolCount, settingsDoc] = await Promise.all([
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
  const fileTokens = 0
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
