import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  buildSyntheticTurnUsageFields,
  buildContextWindowBulkOps,
  buildTurnAccountingBulkOps,
  normalizeUsageTotals,
  type TurnUsageEntry,
} from './turnUsage.ts'

function makeId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId()
}

test('normalizes missing, non-finite, and negative token totals to zero', () => {
  assert.deepEqual(
    normalizeUsageTotals({
      inputTokens: -10,
      outputTokens: Number.NaN,
      cacheCreationInputTokens: undefined,
      cacheReadInputTokens: 25,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 25,
    },
  )
})

test('accounting stamps result totals and cost onto the last visible entry', () => {
  const first = makeId()
  const last = makeId()
  const entries: TurnUsageEntry[] = [
    { id: first, model: 'claude-haiku-4-5' },
    { id: last, model: 'claude-haiku-4-5' },
  ]

  const ops = buildTurnAccountingBulkOps(
    entries,
    {
      inputTokens: 18,
      outputTokens: 579,
      cacheCreationInputTokens: 23497,
      cacheReadInputTokens: 22926,
    },
    0.128,
    { 'claude-haiku-4-5': { contextWindow: 200000 } },
  )

  assert.equal(ops.length, 1)
  assert.equal(ops[0].updateOne.filter._id, last)
  assert.deepEqual(ops[0].updateOne.update.$set, {
    inputTokens: 18,
    outputTokens: 579,
    cacheCreationInputTokens: 23497,
    cacheReadInputTokens: 22926,
    costUsd: 0.128,
    contextWindow: 200000,
  })
})

test('accounting does not reconcile against streamed assistant usage', () => {
  const id = makeId()
  const ops = buildTurnAccountingBulkOps(
    [{ id, model: 'claude-haiku-4-5' }],
    {
      inputTokens: 8,
      outputTokens: 559,
      cacheCreationInputTokens: 571,
      cacheReadInputTokens: 22926,
    },
    0.028955579032258066,
  )

  assert.equal(ops.length, 1)
  assert.equal(ops[0].updateOne.filter._id, id)
  assert.deepEqual(ops[0].updateOne.update.$set, {
    inputTokens: 8,
    outputTokens: 559,
    cacheCreationInputTokens: 571,
    cacheReadInputTokens: 22926,
    costUsd: 0.028955579032258066,
  })
  assert.ok(Object.values(ops[0].updateOne.update.$set).every((value) => value >= 0))
})

test('accounting returns no ops when there is no visible entry', () => {
  const ops = buildTurnAccountingBulkOps(
    [],
    {
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 30,
      cacheReadInputTokens: 40,
    },
    0.2,
  )
  assert.deepEqual(ops, [])
})

test('accounting omits non-finite cost and unknown context window', () => {
  const id = makeId()
  const ops = buildTurnAccountingBulkOps(
    [{ id, model: 'm' }],
    { inputTokens: 1, outputTokens: 2 },
    Number.NaN,
    { other: { contextWindow: 200000 } },
  )

  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].updateOne.update.$set, {
    inputTokens: 1,
    outputTokens: 2,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  })
})

test('accounting clamps negative result totals and cost defensively', () => {
  const id = makeId()
  const ops = buildTurnAccountingBulkOps(
    [{ id }],
    {
      inputTokens: -1,
      outputTokens: -2,
      cacheCreationInputTokens: -3,
      cacheReadInputTokens: -4,
    },
    -0.5,
  )

  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].updateOne.update.$set, {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0,
  })
})

test('synthetic accounting row stores result totals when no visible assistant text exists', () => {
  const fields = buildSyntheticTurnUsageFields(
    'claude-haiku-4-5',
    {
      inputTokens: 8,
      outputTokens: 2,
      cacheCreationInputTokens: 602,
      cacheReadInputTokens: 24532,
    },
    0.036763473214285705,
    { 'claude-haiku-4-5': { contextWindow: 200000 } },
  )

  assert.deepEqual(fields, {
    content: { kind: 'turn_usage' },
    inputTokens: 8,
    outputTokens: 2,
    cacheCreationInputTokens: 602,
    cacheReadInputTokens: 24532,
    costUsd: 0.036763473214285705,
    model: 'claude-haiku-4-5',
    contextWindow: 200000,
  })
})

test('synthetic accounting row clamps result totals and cost defensively', () => {
  const fields = buildSyntheticTurnUsageFields(
    'm',
    {
      inputTokens: -1,
      outputTokens: -2,
      cacheCreationInputTokens: -3,
      cacheReadInputTokens: -4,
    },
    -0.1,
  )

  assert.deepEqual(fields, {
    content: { kind: 'turn_usage' },
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0,
    model: 'm',
  })
})

test('synthetic accounting row is skipped only when result has no accounting data', () => {
  assert.equal(buildSyntheticTurnUsageFields('m', undefined, undefined), null)
})

test('contextWindow ops use modelUsage[model].contextWindow per entry', () => {
  const a = makeId()
  const b = makeId()
  const ops = buildContextWindowBulkOps(
    [
      { id: a, model: 'claude-opus-4-7' },
      { id: b, model: 'claude-haiku-4-5' },
    ],
    {
      'claude-opus-4-7': { contextWindow: 200000 },
      'claude-haiku-4-5': { contextWindow: 200000 },
    },
  )
  assert.equal(ops.length, 2)
  assert.equal(ops[0].updateOne.update.$set.contextWindow, 200000)
  assert.equal(ops[1].updateOne.update.$set.contextWindow, 200000)
})

test('contextWindow ops skip entries with no model', () => {
  const ops = buildContextWindowBulkOps(
    [{ id: makeId() }],
    { 'claude-opus-4-7': { contextWindow: 200000 } },
  )
  assert.deepEqual(ops, [])
})

test('contextWindow ops skip entries when modelUsage is missing the model key', () => {
  const ops = buildContextWindowBulkOps(
    [{ id: makeId(), model: 'claude-opus-4-7' }],
    { 'some-other-model': { contextWindow: 200000 } },
  )
  assert.deepEqual(ops, [])
})

test('contextWindow ops skip non-finite or non-positive values', () => {
  const ops = buildContextWindowBulkOps(
    [{ id: makeId(), model: 'm' }],
    { m: { contextWindow: 0 } },
  )
  assert.deepEqual(ops, [])
})

test('contextWindow ops return empty when modelUsage is undefined', () => {
  const ops = buildContextWindowBulkOps(
    [{ id: makeId(), model: 'claude-opus-4-7' }],
    undefined,
  )
  assert.deepEqual(ops, [])
})
