import type { UsageWindow } from '../shared/types.ts'

export type SparkUnit = 'minute' | 'hour' | 'day' | 'month'

export type SparkSpec = {
  unit: SparkUnit
  binSize: number
  bucketCount: number
}

export type WindowAggregationPipelines = {
  byModel: Record<string, unknown>[]
  recentRuns: Record<string, unknown>[]
  windowSince: Date | null
}

export type CardAggregationPipelines = {
  monthlyTotals: Record<string, unknown>[]
  monthlySpark: Record<string, unknown>[]
  weeklyTotals: Record<string, unknown>[]
  weeklySpark: Record<string, unknown>[]
  hourlyTotals: Record<string, unknown>[]
  hourlySpark: Record<string, unknown>[]
  cardSpecs: { monthly: SparkSpec; weekly: SparkSpec; hourly: SparkSpec }
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export function windowSince(window: UsageWindow, now: Date): Date | null {
  switch (window) {
    case '24h':
      return new Date(now.getTime() - 24 * HOUR_MS)
    case '7d':
      return new Date(now.getTime() - 7 * DAY_MS)
    case '30d':
      return new Date(now.getTime() - 30 * DAY_MS)
    case 'all':
      return null
  }
}

// Fixed-shape card specs. The Finance page renders three usage cards whose
// layout is independent of the window dropdown:
//   Monthly = trailing 30 days, one bar per day
//   Weekly  = trailing 7 days,  one bar per day
//   Hourly  = trailing 24 hours, one bar per hour
export const monthlySparkSpec: SparkSpec = { unit: 'day', binSize: 1, bucketCount: 30 }
export const weeklySparkSpec: SparkSpec = { unit: 'day', binSize: 1, bucketCount: 7 }
export const hourlySparkSpec: SparkSpec = { unit: 'hour', binSize: 1, bucketCount: 24 }

function matchAssistantInWindow(since: Date | null): Record<string, unknown> {
  const createdAt: Record<string, unknown> = {}
  if (since) createdAt.$gte = since
  const match: Record<string, unknown> = { role: 'assistant' }
  if (since) match.createdAt = createdAt
  return match
}

function modelMatchStage(models: string[] | undefined): Record<string, unknown>[] {
  if (!models || models.length === 0) return []
  return [{ $match: { model: { $in: models } } }]
}

function bucketGroupStage(unit: SparkUnit, binSize: number): Record<string, unknown> {
  return {
    $group: {
      _id: { $dateTrunc: { date: '$createdAt', unit, binSize } },
      spendUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
    },
  }
}

// inTokens rolls up new + cache-creation + cache-read input tokens to match
// what the Anthropic console reports as input. Storing the three counters
// separately on Message preserves fidelity with the SDK; we sum them here
// because users want a single "input tokens" number on the UI.
function totalInputExpr(): Record<string, unknown> {
  return {
    $add: [
      { $ifNull: ['$inputTokens', 0] },
      { $ifNull: ['$cacheCreationInputTokens', 0] },
      { $ifNull: ['$cacheReadInputTokens', 0] },
    ],
  }
}

function totalsGroupStage(): Record<string, unknown> {
  return {
    $group: {
      _id: null,
      spendUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
      inTokens: { $sum: totalInputExpr() },
      outTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
    },
  }
}

export function buildWindowAggregationPipelines(
  window: UsageWindow,
  now: Date,
  models?: string[],
): WindowAggregationPipelines {
  const since = windowSince(window, now)

  const byModel: Record<string, unknown>[] = [
    {
      $match: {
        ...matchAssistantInWindow(since),
        model: { $exists: true, $type: 'string' },
      },
    },
    ...modelMatchStage(models),
    {
      $group: {
        _id: '$model',
        inTokens: { $sum: totalInputExpr() },
        outTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
        spendUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
      },
    },
    { $project: { _id: 0, model: '$_id', inTokens: 1, outTokens: 1, spendUsd: 1 } },
    { $sort: { spendUsd: -1 } },
  ]

  // recentRuns: last 12 assistant messages in the window. The id field maps
  // to conversationId so the row can route into the drill-down later. The
  // tokens field is the per-message in+out, not the conversation total,
  // matching how the Finance view treats "runs".
  const recentRuns: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(since) },
    ...modelMatchStage(models),
    { $sort: { createdAt: -1 } },
    { $limit: 12 },
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
        id: { $toString: '$conversationId' },
        title: {
          $ifNull: [{ $arrayElemAt: ['$conversation.title', 0] }, 'untitled'],
        },
        model: {
          $ifNull: ['$model', { $arrayElemAt: ['$conversation.model', 0] }, 'unknown'],
        },
        tokens: {
          $add: [
            { $ifNull: ['$inputTokens', 0] },
            { $ifNull: ['$cacheCreationInputTokens', 0] },
            { $ifNull: ['$cacheReadInputTokens', 0] },
            { $ifNull: ['$outputTokens', 0] },
          ],
        },
        spendUsd: { $ifNull: ['$costUsd', 0] },
      },
    },
  ]

  return { byModel, recentRuns, windowSince: since }
}

// Builds the six aggregations behind the three Finance cards. Each card needs
// one totals query (aggregate spend/tokens over the trailing window) and one
// spark query (per-bucket spend for the bars). Bucket boundaries are UTC,
// matching the rest of usageAggregation.ts; the renderer formats labels with
// the user's local TZ via Intl.DateTimeFormat.
export function buildCardAggregationPipelines(
  now: Date,
  models?: string[],
): CardAggregationPipelines {
  const monthlySince = new Date(now.getTime() - 30 * DAY_MS)
  const weeklySince = new Date(now.getTime() - 7 * DAY_MS)
  const hourlySince = new Date(now.getTime() - 24 * HOUR_MS)

  const totalsPipe = (since: Date): Record<string, unknown>[] => [
    { $match: matchAssistantInWindow(since) },
    ...modelMatchStage(models),
    totalsGroupStage(),
    { $project: { _id: 0, spendUsd: 1, inTokens: 1, outTokens: 1 } },
  ]

  const sparkPipe = (since: Date, spec: SparkSpec): Record<string, unknown>[] => [
    { $match: matchAssistantInWindow(since) },
    ...modelMatchStage(models),
    bucketGroupStage(spec.unit, spec.binSize),
    { $sort: { _id: 1 } },
  ]

  return {
    monthlyTotals: totalsPipe(monthlySince),
    monthlySpark: sparkPipe(monthlySince, monthlySparkSpec),
    weeklyTotals: totalsPipe(weeklySince),
    weeklySpark: sparkPipe(weeklySince, weeklySparkSpec),
    hourlyTotals: totalsPipe(hourlySince),
    hourlySpark: sparkPipe(hourlySince, hourlySparkSpec),
    cardSpecs: { monthly: monthlySparkSpec, weekly: weeklySparkSpec, hourly: hourlySparkSpec },
  }
}

// Computes expected bucket-start timestamps walking back from `now` truncated
// to the bin, in steps of `binSize` * `unit`. For month, uses date arithmetic
// since month length is variable. Returns an array of length spec.bucketCount,
// oldest first, matching the order $sort asc emits.
function expectedBucketStarts(spec: SparkSpec, now: Date): Date[] {
  const out: Date[] = []
  const truncated = truncateDate(now, spec.unit, spec.binSize)
  if (spec.unit === 'month') {
    for (let i = spec.bucketCount - 1; i >= 0; i -= 1) {
      const d = new Date(truncated)
      d.setUTCMonth(d.getUTCMonth() - i * spec.binSize)
      out.push(d)
    }
    return out
  }
  const stepMs = unitMs(spec.unit) * spec.binSize
  for (let i = spec.bucketCount - 1; i >= 0; i -= 1) {
    out.push(new Date(truncated.getTime() - i * stepMs))
  }
  return out
}

function unitMs(unit: SparkUnit): number {
  switch (unit) {
    case 'minute':
      return 60 * 1000
    case 'hour':
      return HOUR_MS
    case 'day':
      return DAY_MS
    case 'month':
      // Approx; not used for month math, but kept for completeness.
      return 30 * DAY_MS
  }
}

function truncateDate(now: Date, unit: SparkUnit, binSize: number): Date {
  const d = new Date(now)
  if (unit === 'minute') {
    d.setUTCSeconds(0, 0)
    const minute = d.getUTCMinutes()
    d.setUTCMinutes(minute - (minute % binSize))
    return d
  }
  if (unit === 'hour') {
    d.setUTCMinutes(0, 0, 0)
    const hour = d.getUTCHours()
    d.setUTCHours(hour - (hour % binSize))
    return d
  }
  if (unit === 'day') {
    d.setUTCHours(0, 0, 0, 0)
    return d
  }
  // month
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export type RawBucket = { _id: Date | string; spendUsd?: number }

// Pure helper: maps raw aggregation buckets onto the expected bucket sequence,
// pads gaps with 0, and emits the per-bucket start timestamps the renderer
// uses to label the selected bar. Output arrays always have length
// spec.bucketCount and are oldest-first.
export function padSparkWithStarts(
  rawBuckets: RawBucket[],
  spec: SparkSpec,
  now: Date,
): { spark: number[]; bucketStarts: string[] } {
  const map = new Map<number, number>()
  for (const b of rawBuckets) {
    const date = b._id instanceof Date ? b._id : new Date(b._id)
    map.set(date.getTime(), typeof b.spendUsd === 'number' ? b.spendUsd : 0)
  }
  const expected = expectedBucketStarts(spec, now)
  return {
    spark: expected.map((d) => map.get(d.getTime()) ?? 0),
    bucketStarts: expected.map((d) => d.toISOString()),
  }
}
