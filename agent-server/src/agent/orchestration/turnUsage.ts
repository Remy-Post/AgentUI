import mongoose from 'mongoose'

export type TurnUsageEntry = {
  id: mongoose.Types.ObjectId
  tokens: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

export type TurnUsageBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: { costUsd: number } }
  }
}

export type TurnReconcileBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: {
      $inc: {
        inputTokens?: number
        outputTokens?: number
        cacheCreationInputTokens?: number
        cacheReadInputTokens?: number
      }
    }
  }
}

export type TurnUsageTotals = {
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
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

// Reconciles per-message token counts against the SDK's authoritative turn
// totals from result.usage. The SDK reports correct turn-level totals but the
// per-message usage we capture during streaming misses tool-use-only and
// sub-agent API calls. The delta (turn total - sum of per-entry tokens) is
// applied via $inc to the LAST entry so that summing inputTokens/outputTokens/
// cache* across the turn's Message rows equals the SDK's turn totals.
// Returns [] when there are no entries or no nonzero delta.
export function buildTurnReconcileBulkOps(
  entries: TurnUsageEntry[],
  totals: TurnUsageTotals,
): TurnReconcileBulkOp[] {
  if (entries.length === 0) return []

  const persistedIn = entries.reduce((acc, e) => acc + (e.inputTokens ?? 0), 0)
  const persistedOut = entries.reduce((acc, e) => acc + (e.outputTokens ?? 0), 0)
  const persistedCacheCreate = entries.reduce(
    (acc, e) => acc + (e.cacheCreationInputTokens ?? 0),
    0,
  )
  const persistedCacheRead = entries.reduce((acc, e) => acc + (e.cacheReadInputTokens ?? 0), 0)

  const deltaIn = (totals.inputTokens ?? 0) - persistedIn
  const deltaOut = (totals.outputTokens ?? 0) - persistedOut
  const deltaCacheCreate = (totals.cacheCreationInputTokens ?? 0) - persistedCacheCreate
  const deltaCacheRead = (totals.cacheReadInputTokens ?? 0) - persistedCacheRead

  const $inc: TurnReconcileBulkOp['updateOne']['update']['$inc'] = {}
  if (deltaIn !== 0) $inc.inputTokens = deltaIn
  if (deltaOut !== 0) $inc.outputTokens = deltaOut
  if (deltaCacheCreate !== 0) $inc.cacheCreationInputTokens = deltaCacheCreate
  if (deltaCacheRead !== 0) $inc.cacheReadInputTokens = deltaCacheRead

  if (Object.keys($inc).length === 0) return []

  const last = entries[entries.length - 1]
  return [{ updateOne: { filter: { _id: last.id }, update: { $inc } } }]
}
