import { Router } from 'express'
import mongoose from 'mongoose'
import type { PipelineStage } from 'mongoose'
import { Message } from '../db/models/Message.ts'
import {
  buildCardAggregationPipelines,
  buildWindowAggregationPipelines,
  padSparkWithStarts,
  windowSince,
  type RawBucket,
} from './usageAggregation.ts'
import type {
  UsageBucket,
  UsageByModelRow,
  UsageDTO,
  UsageRunRow,
  UsageWindow,
} from '../shared/types.ts'

const router = Router()

const ALLOWED_WINDOWS: UsageWindow[] = ['24h', '7d', '30d', 'all']

function parseWindow(value: unknown): UsageWindow {
  if (typeof value === 'string' && (ALLOWED_WINDOWS as string[]).includes(value)) {
    return value as UsageWindow
  }
  return '30d'
}

function parseModels(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return list.length > 0 ? list : undefined
}

type TotalsRow = { spendUsd?: number; inTokens?: number; outTokens?: number }

type UsageExportRow = {
  createdAt?: Date | string
  conversationId: string
  conversationTitle: string
  messageId: string
  model: string
  inputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  outputTokens?: number
  costUsd?: number
}

const CSV_HEADERS = [
  'created_at',
  'conversation_id',
  'conversation_title',
  'message_id',
  'model',
  'input_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'output_tokens',
  'total_tokens',
  'cost_usd',
]

function bucketFromRow(
  row: TotalsRow | undefined,
  padded: { spark: number[]; bucketStarts: string[] },
): UsageBucket {
  return {
    spendUsd: typeof row?.spendUsd === 'number' ? row.spendUsd : 0,
    inTokens: typeof row?.inTokens === 'number' ? row.inTokens : 0,
    outTokens: typeof row?.outTokens === 'number' ? row.outTokens : 0,
    spark: padded.spark,
    bucketStarts: padded.bucketStarts,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function totalTokens(row: UsageExportRow): number | undefined {
  const values = [
    row.inputTokens,
    row.cacheCreationInputTokens,
    row.cacheReadInputTokens,
    row.outputTokens,
  ]
  if (!values.some(isFiniteNumber)) return undefined
  let sum = 0
  for (const value of values) {
    if (isFiniteNumber(value)) sum += value
  }
  return sum
}

function csvCell(value: string | number | undefined): string {
  if (value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvLine(values: Array<string | number | undefined>): string {
  return values.map(csvCell).join(',')
}

function buildUsageCsv(rows: UsageExportRow[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(
      csvLine([
        row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
        row.conversationId,
        row.conversationTitle,
        row.messageId,
        row.model,
        row.inputTokens,
        row.cacheCreationInputTokens,
        row.cacheReadInputTokens,
        row.outputTokens,
        totalTokens(row),
        row.costUsd,
      ]),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}

function buildExportPipeline({
  conversationId,
  since,
  models,
}: {
  conversationId?: mongoose.Types.ObjectId
  since?: Date | null
  models?: string[]
}): Record<string, unknown>[] {
  const match: Record<string, unknown> = { role: 'assistant' }
  if (conversationId) {
    match.conversationId = conversationId
  } else {
    if (since) match.createdAt = { $gte: since }
    if (models && models.length > 0) match.model = { $in: models }
  }

  return [
    { $match: match },
    { $sort: { createdAt: conversationId ? 1 : -1 } },
    {
      $lookup: {
        from: 'conversations',
        localField: 'conversationId',
        foreignField: '_id',
        as: 'conversation',
      },
    },
    {
      $project: {
        _id: 0,
        createdAt: '$createdAt',
        conversationId: { $toString: '$conversationId' },
        conversationTitle: {
          $ifNull: [{ $arrayElemAt: ['$conversation.title', 0] }, 'untitled'],
        },
        messageId: { $toString: '$_id' },
        model: {
          $ifNull: ['$model', { $arrayElemAt: ['$conversation.model', 0] }, 'unknown'],
        },
        inputTokens: '$inputTokens',
        cacheCreationInputTokens: '$cacheCreationInputTokens',
        cacheReadInputTokens: '$cacheReadInputTokens',
        outputTokens: '$outputTokens',
        costUsd: '$costUsd',
      },
    },
  ]
}

router.get('/export.csv', async (req, res) => {
  const conversationIdParam =
    typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined

  if (conversationIdParam && !mongoose.isValidObjectId(conversationIdParam)) {
    return res.status(400).json({ error: 'invalid_conversation_id' })
  }

  const conversationId = conversationIdParam
    ? new mongoose.Types.ObjectId(conversationIdParam)
    : undefined
  const window = parseWindow(req.query.window)
  const models = conversationId ? undefined : parseModels(req.query.models)
  const now = new Date()
  const rows = (await Message.aggregate(
    buildExportPipeline({
      conversationId,
      since: conversationId ? null : windowSince(window, now),
      models,
    }) as unknown as PipelineStage[],
  ).exec()) as UsageExportRow[]

  const filename = conversationIdParam
    ? `agentui-conversation-${conversationIdParam}-usage.csv`
    : `agentui-usage-${window}-${now.toISOString().slice(0, 10)}.csv`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
  return res.status(200).send(buildUsageCsv(rows))
})

router.get('/', async (req, res) => {
  const window = parseWindow(req.query.window)
  const models = parseModels(req.query.models)
  const now = new Date()
  const cardPipes = buildCardAggregationPipelines(now, models)
  const windowPipes = buildWindowAggregationPipelines(window, now, models)

  const asStages = (pipe: Record<string, unknown>[]): PipelineStage[] =>
    pipe as unknown as PipelineStage[]

  const [
    monthlyTotalsRows,
    monthlySparkRows,
    weeklyTotalsRows,
    weeklySparkRows,
    hourlyTotalsRows,
    hourlySparkRows,
    byModelRows,
    recentRunsRows,
  ] = await Promise.all([
    Message.aggregate(asStages(cardPipes.monthlyTotals)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(cardPipes.monthlySpark)).exec() as Promise<RawBucket[]>,
    Message.aggregate(asStages(cardPipes.weeklyTotals)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(cardPipes.weeklySpark)).exec() as Promise<RawBucket[]>,
    Message.aggregate(asStages(cardPipes.hourlyTotals)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(cardPipes.hourlySpark)).exec() as Promise<RawBucket[]>,
    Message.aggregate(asStages(windowPipes.byModel)).exec() as Promise<UsageByModelRow[]>,
    Message.aggregate(asStages(windowPipes.recentRuns)).exec() as Promise<UsageRunRow[]>,
  ])

  const padMonthly = padSparkWithStarts(monthlySparkRows, cardPipes.cardSpecs.monthly, now)
  const padWeekly = padSparkWithStarts(weeklySparkRows, cardPipes.cardSpecs.weekly, now)
  const padHourly = padSparkWithStarts(hourlySparkRows, cardPipes.cardSpecs.hourly, now)

  const dto: UsageDTO = {
    monthly: bucketFromRow(monthlyTotalsRows[0], padMonthly),
    weekly: bucketFromRow(weeklyTotalsRows[0], padWeekly),
    hourly: bucketFromRow(hourlyTotalsRows[0], padHourly),
    byModel: byModelRows.map((r) => ({
      model: r.model,
      inTokens: typeof r.inTokens === 'number' ? r.inTokens : 0,
      outTokens: typeof r.outTokens === 'number' ? r.outTokens : 0,
      spendUsd: typeof r.spendUsd === 'number' ? r.spendUsd : 0,
    })),
    recentRuns: recentRunsRows.map((r) => ({
      id: r.id,
      title: r.title,
      model: r.model,
      tokens: typeof r.tokens === 'number' ? r.tokens : 0,
      spendUsd: typeof r.spendUsd === 'number' ? r.spendUsd : 0,
    })),
  }

  res.json(dto)
})

export default router
