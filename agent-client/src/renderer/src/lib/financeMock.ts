// TODO: replace with /api/usage when backend lands.
// Deterministic mock generator for the Finance view this pass.

export type FinanceWindow = '24h' | '7d' | '30d' | 'all'

export type FinanceData = {
  totals: { spendUsd: number; inTokens: number; outTokens: number; spark: number[] }
  today: { spendUsd: number; inTokens: number; outTokens: number; spark: number[] }
  lastHour: { spendUsd: number; inTokens: number; outTokens: number; spark: number[] }
  byModel: Array<{ model: string; inTokens: number; outTokens: number; spendUsd: number }>
  recentRuns: Array<{ id: string; title: string; model: string; tokens: number; spendUsd: number }>
}

const WINDOW_MULTIPLIER: Record<FinanceWindow, number> = {
  '24h': 0.18,
  '7d': 0.55,
  '30d': 1,
  all: 3.7,
}

const BASE_SPARK = [4, 6, 5, 9, 12, 8, 14, 11, 18, 22, 16, 28, 24, 32, 36, 30, 38, 42, 35, 48, 52, 44, 58, 64]
const TODAY_SPARK = [2, 6, 4, 12, 8, 14, 11, 22, 18, 14, 32, 28]
const HOUR_SPARK = [12, 16, 8, 24, 18, 28, 14, 22, 12, 18, 30, 26]

const MODELS = [
  { model: 'claude-sonnet-4', share: 0.62 },
  { model: 'claude-opus-4', share: 0.28 },
  { model: 'claude-haiku-4-5', share: 0.1 },
]

const RUN_TITLES = [
  'Migrate billing webhooks to Stripe v3',
  'Drafting the Q4 retro doc',
  'Audit feature flag config',
  'Sketch onboarding email sequence',
  'Investigate p99 latency on /search',
  'Refactor session middleware',
  'Plan Q1 hiring loop',
  'Postmortem: payments outage',
  'Sales deck for the new tier',
  'Customer outreach script',
  'Dependency upgrade pass',
  'CI cache reshuffle',
]

function scale(values: number[], mult: number): number[] {
  return values.map((v) => Math.round(v * mult))
}

export function buildFinanceData(window: FinanceWindow): FinanceData {
  const mult = WINDOW_MULTIPLIER[window]
  const spendBase = 18.42 * mult
  const inBase = 1_280_000 * mult
  const outBase = 412_000 * mult

  const totals = {
    spendUsd: spendBase,
    inTokens: Math.round(inBase),
    outTokens: Math.round(outBase),
    spark: scale(BASE_SPARK, mult / 1.6),
  }
  const today = {
    spendUsd: spendBase * 0.07,
    inTokens: Math.round(inBase * 0.06),
    outTokens: Math.round(outBase * 0.06),
    spark: scale(TODAY_SPARK, mult / 2),
  }
  const lastHour = {
    spendUsd: spendBase * 0.012,
    inTokens: Math.round(inBase * 0.01),
    outTokens: Math.round(outBase * 0.01),
    spark: scale(HOUR_SPARK, mult / 2.4),
  }

  const byModel = MODELS.map((m) => ({
    model: m.model,
    inTokens: Math.round(inBase * m.share),
    outTokens: Math.round(outBase * m.share),
    spendUsd: spendBase * m.share,
  }))

  const recentRuns = RUN_TITLES.slice(0, 12).map((title, i) => {
    const modelIdx = i % MODELS.length
    return {
      id: `run-${i}`,
      title,
      model: MODELS[modelIdx].model,
      tokens: Math.round((inBase / 80) * (1 + (i % 5) * 0.18)),
      spendUsd: (spendBase / 36) * (1 + (i % 6) * 0.22),
    }
  })

  return { totals, today, lastHour, byModel, recentRuns }
}
