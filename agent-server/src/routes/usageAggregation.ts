import type { UsageWindow } from '../shared/types.ts'

export type SparkUnit = 'minute' | 'hour' | 'day' | 'month'

export type SparkSpec = {
  unit: SparkUnit
  binSize: number
  bucketCount: number
}

export type AggregationPipelines = {
  totals: Record<string, unknown>[]
  today: Record<string, unknown>[]
  lastHour: Record<string, unknown>[]
  byModel: Record<string, unknown>[]
  recentRuns: Record<string, unknown>[]
  sparkTotals: Record<string, unknown>[]
  sparkToday: Record<string, unknown>[]
  sparkHour: Record<string, unknown>[]
  // Specs for the JS pad helper to fill missing buckets after the pipeline runs.
  sparkSpecs: { totals: SparkSpec; today: SparkSpec; lastHour: SparkSpec }
  windowSince: Date | null
  todaySince: Date
  lastHourSince: Date
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

export function totalsSparkSpec(window: UsageWindow): SparkSpec {
  switch (window) {
    // 24h window: 24 hourly bars cover the full day at one tick per hour.
    case '24h':
      return { unit: 'hour', binSize: 1, bucketCount: 24 }
    // 7d / 30d: daily bars; one bar per day. 7d short-form, 30d full month.
    case '7d':
      return { unit: 'day', binSize: 1, bucketCount: 7 }
    case '30d':
      return { unit: 'day', binSize: 1, bucketCount: 30 }
    // all-time: monthly bars, capped at 24 months so the bar count stays useful.
    case 'all':
      return { unit: 'month', binSize: 1, bucketCount: 24 }
  }
}

// Today: 12 bars of 2 hours each, covering the trailing 24 hours.
export const todaySparkSpec: SparkSpec = { unit: 'hour', binSize: 2, bucketCount: 12 }

// LastHour: 12 bars of 5 minutes each, covering the trailing 60 minutes.
export const lastHourSparkSpec: SparkSpec = { unit: 'minute', binSize: 5, bucketCount: 12 }

function matchAssistantInWindow(since: Date | null): Record<string, unknown> {
  const createdAt: Record<string, unknown> = {}
  if (since) createdAt.$gte = since
  const match: Record<string, unknown> = { role: 'assistant' }
  if (since) match.createdAt = createdAt
  return match
}

function bucketGroupStage(unit: SparkUnit, binSize: number): Record<string, unknown> {
  return {
    $group: {
      _id: { $dateTrunc: { date: '$createdAt', unit, binSize } },
      spendUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
    },
  }
}

function totalsGroupStage(): Record<string, unknown> {
  return {
    $group: {
      _id: null,
      spendUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
      inTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
      outTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
    },
  }
}

export function buildUsageAggregationPipelines(
  window: UsageWindow,
  now: Date,
): AggregationPipelines {
  const since = windowSince(window, now)
  const todaySince = new Date(now.getTime() - 24 * HOUR_MS)
  const lastHourSince = new Date(now.getTime() - 60 * 60 * 1000)
  const sparkTotals = totalsSparkSpec(window)

  const totals: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(since) },
    totalsGroupStage(),
    { $project: { _id: 0, spendUsd: 1, inTokens: 1, outTokens: 1 } },
  ]

  const today: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(todaySince) },
    totalsGroupStage(),
    { $project: { _id: 0, spendUsd: 1, inTokens: 1, outTokens: 1 } },
  ]

  const lastHour: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(lastHourSince) },
    totalsGroupStage(),
    { $project: { _id: 0, spendUsd: 1, inTokens: 1, outTokens: 1 } },
  ]

  const byModel: Record<string, unknown>[] = [
    {
      $match: {
        ...matchAssistantInWindow(since),
        model: { $exists: true, $type: 'string' },
      },
    },
    {
      $group: {
        _id: '$model',
        inTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
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
            { $ifNull: ['$outputTokens', 0] },
          ],
        },
        spendUsd: { $ifNull: ['$costUsd', 0] },
      },
    },
  ]

  const sparkTotalsPipeline: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(since) },
    bucketGroupStage(sparkTotals.unit, sparkTotals.binSize),
    { $sort: { _id: 1 } },
  ]

  const sparkToday: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(todaySince) },
    bucketGroupStage(todaySparkSpec.unit, todaySparkSpec.binSize),
    { $sort: { _id: 1 } },
  ]

  const sparkHour: Record<string, unknown>[] = [
    { $match: matchAssistantInWindow(lastHourSince) },
    bucketGroupStage(lastHourSparkSpec.unit, lastHourSparkSpec.binSize),
    { $sort: { _id: 1 } },
  ]

  return {
    totals,
    today,
    lastHour,
    byModel,
    recentRuns,
    sparkTotals: sparkTotalsPipeline,
    sparkToday,
    sparkHour,
    sparkSpecs: { totals: sparkTotals, today: todaySparkSpec, lastHour: lastHourSparkSpec },
    windowSince: since,
    todaySince,
    lastHourSince,
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

// Pure helper: maps raw aggregation buckets onto the expected bucket sequence
// and pads gaps with 0. Output length always equals spec.bucketCount.
export function padSparkBuckets(rawBuckets: RawBucket[], spec: SparkSpec, now: Date): number[] {
  const map = new Map<number, number>()
  for (const b of rawBuckets) {
    const date = b._id instanceof Date ? b._id : new Date(b._id)
    map.set(date.getTime(), typeof b.spendUsd === 'number' ? b.spendUsd : 0)
  }
  const expected = expectedBucketStarts(spec, now)
  return expected.map((d) => map.get(d.getTime()) ?? 0)
}
