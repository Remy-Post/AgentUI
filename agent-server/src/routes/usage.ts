import { Router } from 'express'
import type { PipelineStage } from 'mongoose'
import { Message } from '../db/models/Message.ts'
import {
  buildUsageAggregationPipelines,
  padSparkBuckets,
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

type TotalsRow = { spendUsd?: number; inTokens?: number; outTokens?: number }

function emptyBucket(spark: number[]): UsageBucket {
  return { spendUsd: 0, inTokens: 0, outTokens: 0, spark }
}

function bucketFromRow(row: TotalsRow | undefined, spark: number[]): UsageBucket {
  if (!row) return emptyBucket(spark)
  return {
    spendUsd: typeof row.spendUsd === 'number' ? row.spendUsd : 0,
    inTokens: typeof row.inTokens === 'number' ? row.inTokens : 0,
    outTokens: typeof row.outTokens === 'number' ? row.outTokens : 0,
    spark,
  }
}

router.get('/', async (req, res) => {
  const window = parseWindow(req.query.window)
  const now = new Date()
  const pipelines = buildUsageAggregationPipelines(window, now)

  const asStages = (pipe: Record<string, unknown>[]): PipelineStage[] =>
    pipe as unknown as PipelineStage[]

  const [
    totalsRows,
    todayRows,
    lastHourRows,
    byModelRows,
    recentRunsRows,
    sparkTotalsRows,
    sparkTodayRows,
    sparkHourRows,
  ] = await Promise.all([
    Message.aggregate(asStages(pipelines.totals)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(pipelines.today)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(pipelines.lastHour)).exec() as Promise<TotalsRow[]>,
    Message.aggregate(asStages(pipelines.byModel)).exec() as Promise<UsageByModelRow[]>,
    Message.aggregate(asStages(pipelines.recentRuns)).exec() as Promise<UsageRunRow[]>,
    Message.aggregate(asStages(pipelines.sparkTotals)).exec() as Promise<RawBucket[]>,
    Message.aggregate(asStages(pipelines.sparkToday)).exec() as Promise<RawBucket[]>,
    Message.aggregate(asStages(pipelines.sparkHour)).exec() as Promise<RawBucket[]>,
  ])

  const sparkTotals = padSparkBuckets(sparkTotalsRows, pipelines.sparkSpecs.totals, now)
  const sparkToday = padSparkBuckets(sparkTodayRows, pipelines.sparkSpecs.today, now)
  const sparkHour = padSparkBuckets(sparkHourRows, pipelines.sparkSpecs.lastHour, now)

  const dto: UsageDTO = {
    totals: bucketFromRow(totalsRows[0], sparkTotals),
    today: bucketFromRow(todayRows[0], sparkToday),
    lastHour: bucketFromRow(lastHourRows[0], sparkHour),
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
