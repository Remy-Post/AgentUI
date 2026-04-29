import mongoose from 'mongoose'

export type TurnUsageEntry = {
  id: mongoose.Types.ObjectId
  tokens: number
  model?: string
}

export type TurnUsageBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: { costUsd: number } }
  }
}

export type ContextWindowBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: { contextWindow: number } }
  }
}

// Records the per-message context window size from result.modelUsage[model].
// Distinct from cost ops so the cost helper stays single-purpose and its
// existing tests remain valid. Skips entries with no model or unknown
// contextWindow so legacy/edge cases don't drop garbage values.
export function buildContextWindowBulkOps(
  entries: TurnUsageEntry[],
  modelUsage: Record<string, { contextWindow?: number }> | undefined,
): ContextWindowBulkOp[] {
  if (!modelUsage) return []
  const ops: ContextWindowBulkOp[] = []
  for (const entry of entries) {
    if (!entry.model) continue
    const cw = modelUsage[entry.model]?.contextWindow
    if (typeof cw !== 'number' || cw <= 0 || !Number.isFinite(cw)) continue
    ops.push({
      updateOne: { filter: { _id: entry.id }, update: { $set: { contextWindow: cw } } },
    })
  }
  return ops
}

// Distributes total_cost_usd across the turn's tracked top-level assistant
// message ids. Token-weighted by (input + output); falls back to even split
// when every entry has zero tokens. Returns an empty op list when total is
// zero or no entries are tracked, so the caller can skip the bulkWrite.
export function buildTurnUsageBulkOps(
  entries: TurnUsageEntry[],
  totalCostUsd: number,
): TurnUsageBulkOp[] {
  if (entries.length === 0) return []
  if (!Number.isFinite(totalCostUsd) || totalCostUsd === 0) return []

  const weights = entries.map((e) => (Number.isFinite(e.tokens) && e.tokens > 0 ? e.tokens : 0))
  const sum = weights.reduce((acc, w) => acc + w, 0)

  if (sum <= 0) {
    const even = totalCostUsd / entries.length
    return entries.map((e) => ({
      updateOne: { filter: { _id: e.id }, update: { $set: { costUsd: even } } },
    }))
  }

  return entries.map((e, i) => {
    const costUsd = totalCostUsd * (weights[i] / sum)
    return { updateOne: { filter: { _id: e.id }, update: { $set: { costUsd } } } }
  })
}
