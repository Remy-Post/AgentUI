import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUsageAggregationPipelines,
  padSparkBuckets,
  todaySparkSpec,
  lastHourSparkSpec,
  totalsSparkSpec,
  windowSince,
  type RawBucket,
  type SparkSpec,
} from './usageAggregation.ts'

const FIXED_NOW = new Date('2026-04-29T12:34:56.000Z')

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function findStage(pipeline: Record<string, unknown>[], stage: string): Record<string, unknown> | undefined {
  return pipeline.find((s) => stage in s)
}

test('windowSince returns expected lower bound for each window', () => {
  assert.equal(windowSince('24h', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 24 * HOUR_MS)
  assert.equal(windowSince('7d', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 7 * DAY_MS)
  assert.equal(windowSince('30d', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 30 * DAY_MS)
  assert.equal(windowSince('all', FIXED_NOW), null)
})

test('totals pipeline matches assistant role and groups summing tokens and cost', () => {
  const { totals } = buildUsageAggregationPipelines('30d', FIXED_NOW)
  const match = findStage(totals, '$match')?.$match as Record<string, unknown>
  const group = findStage(totals, '$group')?.$group as Record<string, unknown>

  assert.equal(match.role, 'assistant')
  const createdAt = match.createdAt as { $gte: Date }
  assert.ok(createdAt.$gte instanceof Date)
  assert.equal(createdAt.$gte.getTime(), FIXED_NOW.getTime() - 30 * DAY_MS)

  assert.equal(group._id, null)
  assert.deepEqual(Object.keys(group).sort(), ['_id', 'inTokens', 'outTokens', 'spendUsd'])
})

test('totals pipeline omits createdAt $match for window=all', () => {
  const { totals } = buildUsageAggregationPipelines('all', FIXED_NOW)
  const match = findStage(totals, '$match')?.$match as Record<string, unknown>
  assert.equal(match.role, 'assistant')
  assert.equal('createdAt' in match, false)
})

test('today pipeline always uses last 24 hours regardless of window', () => {
  const { today: t30 } = buildUsageAggregationPipelines('30d', FIXED_NOW)
  const { today: tAll } = buildUsageAggregationPipelines('all', FIXED_NOW)
  for (const today of [t30, tAll]) {
    const match = findStage(today, '$match')?.$match as Record<string, unknown>
    const createdAt = match.createdAt as { $gte: Date }
    assert.equal(createdAt.$gte.getTime(), FIXED_NOW.getTime() - 24 * HOUR_MS)
  }
})

test('lastHour pipeline uses last 60 minutes regardless of window', () => {
  const { lastHour } = buildUsageAggregationPipelines('7d', FIXED_NOW)
  const match = findStage(lastHour, '$match')?.$match as Record<string, unknown>
  const createdAt = match.createdAt as { $gte: Date }
  assert.equal(createdAt.$gte.getTime(), FIXED_NOW.getTime() - 60 * 60 * 1000)
})

test('byModel pipeline filters out missing or non-string model and groups on $model', () => {
  const { byModel } = buildUsageAggregationPipelines('30d', FIXED_NOW)
  const match = findStage(byModel, '$match')?.$match as Record<string, unknown>
  assert.equal(match.role, 'assistant')
  assert.deepEqual(match.model, { $exists: true, $type: 'string' })

  const group = findStage(byModel, '$group')?.$group as Record<string, unknown>
  assert.equal(group._id, '$model')

  const sort = findStage(byModel, '$sort')?.$sort as Record<string, unknown>
  assert.equal(sort.spendUsd, -1)
})

test('recentRuns pipeline sorts newest, limits 12, and looks up conversation', () => {
  const { recentRuns } = buildUsageAggregationPipelines('30d', FIXED_NOW)
  const sort = findStage(recentRuns, '$sort')?.$sort as Record<string, unknown>
  const limit = findStage(recentRuns, '$limit')?.$limit
  const lookup = findStage(recentRuns, '$lookup')?.$lookup as Record<string, unknown>
  const project = findStage(recentRuns, '$project')?.$project as Record<string, unknown>

  assert.equal(sort.createdAt, -1)
  assert.equal(limit, 12)
  assert.equal(lookup.from, 'conversations')
  assert.equal(lookup.localField, 'conversationId')
  assert.equal(lookup.foreignField, '_id')
  assert.deepEqual(Object.keys(project).sort(), ['_id', 'id', 'model', 'spendUsd', 'title', 'tokens'])
})

test('totalsSparkSpec returns the right unit and bucket count per window', () => {
  assert.deepEqual(totalsSparkSpec('24h'), { unit: 'hour', binSize: 1, bucketCount: 24 })
  assert.deepEqual(totalsSparkSpec('7d'), { unit: 'day', binSize: 1, bucketCount: 7 })
  assert.deepEqual(totalsSparkSpec('30d'), { unit: 'day', binSize: 1, bucketCount: 30 })
  assert.deepEqual(totalsSparkSpec('all'), { unit: 'month', binSize: 1, bucketCount: 24 })
})

test('today spark spec is 12 buckets of 2 hours each', () => {
  assert.deepEqual(todaySparkSpec, { unit: 'hour', binSize: 2, bucketCount: 12 })
})

test('lastHour spark spec is 12 buckets of 5 minutes each', () => {
  assert.deepEqual(lastHourSparkSpec, { unit: 'minute', binSize: 5, bucketCount: 12 })
})

test('spark pipelines use $dateTrunc with matching unit and binSize', () => {
  const { sparkTotals, sparkToday, sparkHour } = buildUsageAggregationPipelines('24h', FIXED_NOW)
  for (const [pipe, expected] of [
    [sparkTotals, { unit: 'hour', binSize: 1 }],
    [sparkToday, { unit: 'hour', binSize: 2 }],
    [sparkHour, { unit: 'minute', binSize: 5 }],
  ] as const) {
    const group = findStage(pipe, '$group')?.$group as { _id: { $dateTrunc: Record<string, unknown> } }
    assert.equal(group._id.$dateTrunc.unit, expected.unit)
    assert.equal(group._id.$dateTrunc.binSize, expected.binSize)
  }
})

test('padSparkBuckets fills missing buckets with zero and preserves order', () => {
  const spec: SparkSpec = { unit: 'hour', binSize: 1, bucketCount: 4 }
  // Pretend now is exactly on the hour for deterministic bucket starts.
  const now = new Date('2026-04-29T12:00:00.000Z')
  // Buckets walk back from truncated(now): 12:00, 11:00, 10:00, 09:00 (oldest first when emitted).
  // Provide a single raw bucket at 11:00.
  const raw: RawBucket[] = [{ _id: new Date('2026-04-29T11:00:00.000Z'), spendUsd: 7 }]
  const out = padSparkBuckets(raw, spec, now)
  assert.equal(out.length, 4)
  // Order: oldest first -> [09:00, 10:00, 11:00, 12:00]
  assert.deepEqual(out, [0, 0, 7, 0])
})

test('padSparkBuckets returns all zeros when raw is empty', () => {
  const spec: SparkSpec = { unit: 'minute', binSize: 5, bucketCount: 12 }
  const out = padSparkBuckets([], spec, FIXED_NOW)
  assert.equal(out.length, 12)
  assert.ok(out.every((v) => v === 0))
})

test('padSparkBuckets handles month bucketing without ms approximation drift', () => {
  const spec: SparkSpec = { unit: 'month', binSize: 1, bucketCount: 3 }
  const now = new Date('2026-04-15T00:00:00.000Z')
  // Truncated to month start: 2026-04-01. Three buckets back: 2026-02-01, 2026-03-01, 2026-04-01.
  const raw: RawBucket[] = [
    { _id: new Date('2026-03-01T00:00:00.000Z'), spendUsd: 5 },
    { _id: new Date('2026-04-01T00:00:00.000Z'), spendUsd: 9 },
  ]
  const out = padSparkBuckets(raw, spec, now)
  assert.deepEqual(out, [0, 5, 9])
})
