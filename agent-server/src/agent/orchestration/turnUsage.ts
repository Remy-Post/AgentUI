import mongoose from 'mongoose'

export type TurnUsageEntry = {
  id: mongoose.Types.ObjectId
  model?: string
}

export type TurnAccountingSet = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  costUsd?: number
  contextWindow?: number
}

export type TurnAccountingBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: TurnAccountingSet }
  }
}

export type TurnUsageTotals = {
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

export type SyntheticTurnUsageFields = TurnAccountingSet & {
  content: { kind: 'turn_usage' }
  model: string
}

export type ContextWindowBulkOp = {
  updateOne: {
    filter: { _id: mongoose.Types.ObjectId }
    update: { $set: { contextWindow: number } }
  }
}

function tokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function costValue(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined
}

export function normalizeUsageTotals(totals: TurnUsageTotals): Required<TurnUsageTotals> {
  return {
    inputTokens: tokenCount(totals.inputTokens),
    outputTokens: tokenCount(totals.outputTokens),
    cacheCreationInputTokens: tokenCount(totals.cacheCreationInputTokens),
    cacheReadInputTokens: tokenCount(totals.cacheReadInputTokens),
  }
}

function contextWindowForEntry(
  entry: TurnUsageEntry,
  modelUsage: Record<string, { contextWindow?: number }> | undefined,
): number | undefined {
  if (!entry.model || !modelUsage) return undefined
  const cw = modelUsage[entry.model]?.contextWindow
  return typeof cw === 'number' && cw > 0 && Number.isFinite(cw) ? cw : undefined
}

function accountingTotal(totals: Required<TurnUsageTotals>): number {
  return (
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationInputTokens +
    totals.cacheReadInputTokens
  )
}

export function pickSyntheticAccountingTarget(
  conversationModel: string,
  modelUsage: Record<string, { contextWindow?: number }> | undefined,
): { model: string; contextWindow?: number } {
  const preferred = modelUsage?.[conversationModel]
  if (preferred) {
    return {
      model: conversationModel,
      contextWindow:
        typeof preferred.contextWindow === 'number' &&
        preferred.contextWindow > 0 &&
        Number.isFinite(preferred.contextWindow)
          ? preferred.contextWindow
          : undefined,
    }
  }

  const first = modelUsage ? Object.entries(modelUsage)[0] : undefined
  if (!first) return { model: conversationModel }
  const [model, usage] = first
  return {
    model,
    contextWindow:
      typeof usage.contextWindow === 'number' &&
      usage.contextWindow > 0 &&
      Number.isFinite(usage.contextWindow)
        ? usage.contextWindow
        : undefined,
  }
}

// Records the per-message context window size from result.modelUsage[model].
// Skips entries with no model or unknown contextWindow so legacy/edge cases
// don't drop garbage values.
export function buildContextWindowBulkOps(
  entries: TurnUsageEntry[],
  modelUsage: Record<string, { contextWindow?: number }> | undefined,
): ContextWindowBulkOp[] {
  const ops: ContextWindowBulkOp[] = []
  for (const entry of entries) {
    const cw = contextWindowForEntry(entry, modelUsage)
    if (cw === undefined) continue
    ops.push({
      updateOne: { filter: { _id: entry.id }, update: { $set: { contextWindow: cw } } },
    })
  }
  return ops
}

// Applies the SDK result event's authoritative turn totals to a single
// visible top-level assistant row. Streamed assistant usage is not additive
// in practice: tool-use-only and final answer events can repeat prior usage.
// Stamping final result totals once prevents double-counting and negative
// reconciliation deltas.
export function buildTurnAccountingBulkOps(
  entries: TurnUsageEntry[],
  totals: TurnUsageTotals,
  totalCostUsd?: number,
  modelUsage?: Record<string, { contextWindow?: number }>,
): TurnAccountingBulkOp[] {
  if (entries.length === 0) return []

  const last = entries[entries.length - 1]
  const normalized = normalizeUsageTotals(totals)
  const $set: TurnAccountingSet = { ...normalized }
  const costUsd = costValue(totalCostUsd)
  const contextWindow = contextWindowForEntry(last, modelUsage)

  if (costUsd !== undefined) $set.costUsd = costUsd
  if (contextWindow !== undefined) $set.contextWindow = contextWindow

  return [{ updateOne: { filter: { _id: last.id }, update: { $set } } }]
}

export function buildSyntheticTurnUsageFields(
  conversationModel: string,
  totals: TurnUsageTotals | undefined,
  totalCostUsd?: number,
  modelUsage?: Record<string, { contextWindow?: number }>,
): SyntheticTurnUsageFields | null {
  const normalized = normalizeUsageTotals(totals ?? {})
  const costUsd = costValue(totalCostUsd)

  if (accountingTotal(normalized) === 0 && costUsd === undefined) return null

  const target = pickSyntheticAccountingTarget(conversationModel, modelUsage)
  return {
    content: { kind: 'turn_usage' },
    ...normalized,
    ...(costUsd !== undefined ? { costUsd } : {}),
    model: target.model,
    ...(target.contextWindow !== undefined ? { contextWindow: target.contextWindow } : {}),
  }
}
