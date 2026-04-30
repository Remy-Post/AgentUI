import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCardAggregationPipelines,
  buildWindowAggregationPipelines,
  padSparkWithStarts,
  monthlySparkSpec,
  weeklySparkSpec,
  hourlySparkSpec,
  windowSince,
  type RawBucket,
  type SparkSpec,
} from './usageAggregation.ts'

const FIXED_NOW = new Date('2026-04-29T12:34:56.000Z')

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function findStage(
  pipeline: Record<string, unknown>[],
  stage: string,
): Record<string, unknown> | undefined {
  return pipeline.find((s) => stage in s)
}

test('windowSince returns expected lower bound for each window', () => {
  assert.equal(windowSince('24h', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 24 * HOUR_MS)
  assert.equal(windowSince('7d', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 7 * DAY_MS)
  assert.equal(windowSince('30d', FIXED_NOW)?.getTime(), FIXED_NOW.getTime() - 30 * DAY_MS)
  assert.equal(windowSince('all', FIXED_NOW), null)
})

test('byModel pipeline filters out missing or non-string model and groups on $model', () => {
  const { byModel } = buildWindowAggregationPipelines('30d', FIXED_NOW)
  const match = findStage(byModel, '$match')?.$match as Record<string, unknown>
  assert.equal(match.role, 'assistant')
  assert.deepEqual(match.model, { $exists: true, $type: 'string' })

  const group = findStage(byModel, '$group')?.$group as Record<string, unknown>
  assert.equal(group._id, '$model')

  const sort = findStage(byModel, '$sort')?.$sort as Record<string, unknown>
  assert.equal(sort.spendUsd, -1)
})

test('byModel pipeline omits createdAt $match for window=all', () => {
  const { byModel } = buildWindowAggregationPipelines('all', FIXED_NOW)
  const match = findStage(byModel, '$match')?.$match as Record<string, unknown>
  assert.equal(match.role, 'assistant')
  assert.equal('createdAt' in match, false)
})

test('byModel inTokens rolls up new + cache-creation + cache-read input tokens', () => {
  const { byModel } = buildWindowAggregationPipelines('30d', FIXED_NOW)
  const group = findStage(byModel, '$group')?.$group as Record<string, unknown>
  const inSum = group.inTokens as { $sum: { $add: Array<{ $ifNull: [string, number] }> } }
  const fields = inSum.$sum.$add.map((expr) => expr.$ifNull[0]).sort()
  assert.deepEqual(fields, ['$cacheCreationInputTokens', '$cacheReadInputTokens', '$inputTokens'])
})

test('recentRuns tokens field rolls up all four input categories plus output', () => {
  const { recentRuns } = buildWindowAggregationPipelines('30d', FIXED_NOW)
  const project = findStage(recentRuns, '$project')?.$project as Record<string, unknown>
  const tokensExpr = project.tokens as { $add: Array<{ $ifNull: [string, number] }> }
  const fields = tokensExpr.$add.map((expr) => expr.$ifNull[0]).sort()
  assert.deepEqual(fields, [
    '$cacheCreationInputTokens',
    '$cacheReadInputTokens',
    '$inputTokens',
    '$outputTokens',
  ])
})

test('recentRuns pipeline sorts newest, limits 12, and looks up conversation', () => {
  const { recentRuns } = buildWindowAggregationPipelines('30d', FIXED_NOW)
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

test('card spark specs are fixed at 30 daily / 7 daily / 24 hourly buckets', () => {
  assert.deepEqual(monthlySparkSpec, { unit: 'day', binSize: 1, bucketCount: 30 })
  assert.deepEqual(weeklySparkSpec, { unit: 'day', binSize: 1, bucketCount: 7 })
  assert.deepEqual(hourlySparkSpec, { unit: 'hour', binSize: 1, bucketCount: 24 })
})

test('card totals pipelines bound their match by trailing 30d / 7d / 24h regardless of caller', () => {
  const { monthlyTotals, weeklyTotals, hourlyTotals } = buildCardAggregationPipelines(FIXED_NOW)
  const cases: Array<[Record<string, unknown>[], number]> = [
    [monthlyTotals, FIXED_NOW.getTime() - 30 * DAY_MS],
    [weeklyTotals, FIXED_NOW.getTime() - 7 * DAY_MS],
    [hourlyTotals, FIXED_NOW.getTime() - 24 * HOUR_MS],
  ]
  for (const [pipe, expectedSinceMs] of cases) {
    const match = findStage(pipe, '$match')?.$match as Record<string, unknown>
    assert.equal(match.role, 'assistant')
    const createdAt = match.createdAt as { $gte: Date }
    assert.equal(createdAt.$gte.getTime(), expectedSinceMs)
    const group = findStage(pipe, '$group')?.$group as Record<string, unknown>
    assert.equal(group._id, null)
    assert.deepEqual(Object.keys(group).sort(), ['_id', 'inTokens', 'outTokens', 'spendUsd'])
  }
})

test('card spark pipelines use $dateTrunc with matching unit and binSize', () => {
  const { monthlySpark, weeklySpark, hourlySpark } = buildCardAggregationPipelines(FIXED_NOW)
  const cases: Array<[Record<string, unknown>[], { unit: string; binSize: number }]> = [
    [monthlySpark, { unit: 'day', binSize: 1 }],
    [weeklySpark, { unit: 'day', binSize: 1 }],
    [hourlySpark, { unit: 'hour', binSize: 1 }],
  ]
  for (const [pipe, expected] of cases) {
    const group = findStage(pipe, '$group')?.$group as {
      _id: { $dateTrunc: Record<string, unknown> }
    }
    assert.equal(group._id.$dateTrunc.unit, expected.unit)
    assert.equal(group._id.$dateTrunc.binSize, expected.binSize)
  }
})

test('padSparkWithStarts fills missing buckets with zero, preserves order, and emits ISO starts', () => {
  const spec: SparkSpec = { unit: 'hour', binSize: 1, bucketCount: 4 }
  // Pretend now is exactly on the hour for deterministic bucket starts.
  const now = new Date('2026-04-29T12:00:00.000Z')
  // Buckets walk back from truncated(now): emitted oldest-first as [09:00, 10:00, 11:00, 12:00].
  const raw: RawBucket[] = [{ _id: new Date('2026-04-29T11:00:00.000Z'), spendUsd: 7 }]
  const out = padSparkWithStarts(raw, spec, now)
  assert.deepEqual(out.spark, [0, 0, 7, 0])
  assert.deepEqual(out.bucketStarts, [
    '2026-04-29T09:00:00.000Z',
    '2026-04-29T10:00:00.000Z',
    '2026-04-29T11:00:00.000Z',
    '2026-04-29T12:00:00.000Z',
  ])
})

test('padSparkWithStarts returns all-zero spark and bucketStarts of expected length when raw is empty', () => {
  const spec: SparkSpec = { unit: 'minute', binSize: 5, bucketCount: 12 }
  const out = padSparkWithStarts([], spec, FIXED_NOW)
  assert.equal(out.spark.length, 12)
  assert.equal(out.bucketStarts.length, 12)
  assert.ok(out.spark.every((v: number) => v === 0))
})

test('padSparkWithStarts handles month bucketing without ms approximation drift', () => {
  const spec: SparkSpec = { unit: 'month', binSize: 1, bucketCount: 3 }
  const now = new Date('2026-04-15T00:00:00.000Z')
  // Truncated to month start: 2026-04-01. Three buckets back: 2026-02-01, 2026-03-01, 2026-04-01.
  const raw: RawBucket[] = [
    { _id: new Date('2026-03-01T00:00:00.000Z'), spendUsd: 5 },
    { _id: new Date('2026-04-01T00:00:00.000Z'), spendUsd: 9 },
  ]
  const out = padSparkWithStarts(raw, spec, now)
  assert.deepEqual(out.spark, [0, 5, 9])
  assert.deepEqual(out.bucketStarts, [
    '2026-02-01T00:00:00.000Z',
    '2026-03-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z',
  ])
})
