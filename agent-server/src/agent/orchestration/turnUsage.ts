import mongoose from 'mongoose'

export type TurnUsageEntry = {
  id: mongoose.Types.ObjectId
  tokens: number
}

export type TurnUsageBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: { costUsd: number } }
  }
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
