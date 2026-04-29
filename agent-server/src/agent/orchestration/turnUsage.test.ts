import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { buildTurnUsageBulkOps, type TurnUsageEntry, type TurnUsageBulkOp } from './turnUsage.ts'

function makeId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId()
}

function sumCost(ops: TurnUsageBulkOp[]): number {
  return ops.reduce((acc, op) => acc + op.updateOne.update.$set.costUsd, 0)
}

test('single-message turn assigns the full cost to one op', () => {
  const id = makeId()
  const ops = buildTurnUsageBulkOps([{ id, tokens: 1000 }], 0.42)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].updateOne.update.$set.costUsd, 0.42)
  assert.equal(ops[0].updateOne.filter._id, id)
})

test('two-message turn splits cost token-weighted', () => {
  const a = makeId()
  const b = makeId()
  const entries: TurnUsageEntry[] = [
    { id: a, tokens: 100 },
    { id: b, tokens: 300 },
  ]
  const total = 0.4
  const ops = buildTurnUsageBulkOps(entries, total)
  assert.equal(ops.length, 2)

  // 100/(100+300) = 0.25 of total -> 0.10
  // 300/(100+300) = 0.75 of total -> 0.30
  assert.ok(Math.abs(ops[0].updateOne.update.$set.costUsd - 0.1) < 1e-9)
  assert.ok(Math.abs(ops[1].updateOne.update.$set.costUsd - 0.3) < 1e-9)
  assert.ok(Math.abs(sumCost(ops) - total) < 1e-9)
})

test('two-message turn with all-zero tokens falls back to even split', () => {
  const a = makeId()
  const b = makeId()
  const ops = buildTurnUsageBulkOps(
    [
      { id: a, tokens: 0 },
      { id: b, tokens: 0 },
    ],
    0.6,
  )
  assert.equal(ops.length, 2)
  assert.ok(Math.abs(ops[0].updateOne.update.$set.costUsd - 0.3) < 1e-9)
  assert.ok(Math.abs(ops[1].updateOne.update.$set.costUsd - 0.3) < 1e-9)
  assert.ok(Math.abs(sumCost(ops) - 0.6) < 1e-9)
})

test('total_cost_usd of zero returns no ops', () => {
  const ops = buildTurnUsageBulkOps([{ id: makeId(), tokens: 100 }], 0)
  assert.deepEqual(ops, [])
})

test('empty entries return no ops even when cost is non-zero', () => {
  const ops = buildTurnUsageBulkOps([], 0.5)
  assert.deepEqual(ops, [])
})

test('non-finite cost returns no ops', () => {
  const ops = buildTurnUsageBulkOps([{ id: makeId(), tokens: 100 }], Number.NaN)
  assert.deepEqual(ops, [])
})

test('two consecutive turns produce ops that target only their own ids', () => {
  const turn1 = [{ id: makeId(), tokens: 100 }]
  const turn2 = [{ id: makeId(), tokens: 100 }]
  const ops1 = buildTurnUsageBulkOps(turn1, 0.1)
  const ops2 = buildTurnUsageBulkOps(turn2, 0.2)

  assert.equal(ops1.length, 1)
  assert.equal(ops2.length, 1)
  assert.equal(ops1[0].updateOne.filter._id, turn1[0].id)
  assert.equal(ops2[0].updateOne.filter._id, turn2[0].id)
  assert.notEqual(ops1[0].updateOne.filter._id, turn2[0].id)
  assert.notEqual(ops2[0].updateOne.filter._id, turn1[0].id)
})

test('filter shape is { _id }, never $exists or role/conversationId match', () => {
  const ops = buildTurnUsageBulkOps([{ id: makeId(), tokens: 50 }], 0.1)
  const filter = ops[0].updateOne.filter as Record<string, unknown>
  assert.deepEqual(Object.keys(filter), ['_id'])
  // Defensive: the filter must not regress to the old buggy form.
  assert.equal('costUsd' in filter, false)
  assert.equal('role' in filter, false)
  assert.equal('conversationId' in filter, false)
})

test('update shape is { $set: { costUsd } } only', () => {
  const ops = buildTurnUsageBulkOps([{ id: makeId(), tokens: 50 }], 0.1)
  const update = ops[0].updateOne.update as Record<string, unknown>
  assert.deepEqual(Object.keys(update), ['$set'])
  const set = update.$set as Record<string, unknown>
  assert.deepEqual(Object.keys(set), ['costUsd'])
})

test('negative tokens are clamped to zero in weighting', () => {
  const a = makeId()
  const b = makeId()
  const ops = buildTurnUsageBulkOps(
    [
      { id: a, tokens: -50 },
      { id: b, tokens: 100 },
    ],
    0.5,
  )
  // a's weight is clamped to 0; b takes the full cost.
  assert.equal(ops.length, 2)
  assert.equal(ops[0].updateOne.update.$set.costUsd, 0)
  assert.ok(Math.abs(ops[1].updateOne.update.$set.costUsd - 0.5) < 1e-9)
})
