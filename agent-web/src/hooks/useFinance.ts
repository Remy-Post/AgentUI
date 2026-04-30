import { useQuery } from '@tanstack/react-query'
import type { UsageBucket, UsageDTO, UsageWindow } from '@shared/types'
import { apiFetch } from '../lib/api'

export type FinanceWindow = UsageWindow
export type FinanceData = UsageDTO

const EMPTY_BUCKET: UsageBucket = {
  spendUsd: 0,
  inTokens: 0,
  outTokens: 0,
  spark: [],
  bucketStarts: []
}

const EMPTY_USAGE: FinanceData = {
  monthly: EMPTY_BUCKET,
  weekly: EMPTY_BUCKET,
  hourly: EMPTY_BUCKET,
  byModel: [],
  recentRuns: []
}

const TOTAL_MODEL_COUNT = 3

export function useFinance({
  window,
  models
}: {
  window: FinanceWindow
  models: string[]
}): {
  data: FinanceData
  isLoading: boolean
} {
  const sortedKey = [...models].sort().join(',')
  const sendModels = models.length > 0 && models.length < TOTAL_MODEL_COUNT
  const query = useQuery({
    queryKey: ['finance', 'v2', window, sortedKey],
    queryFn: () => {
      const params = new URLSearchParams({ window })
      if (sendModels) params.set('models', models.join(','))
      return apiFetch<UsageDTO>(`/api/usage?${params.toString()}`)
    },
    staleTime: 30_000
  })
  return {
    data: query.data ?? EMPTY_USAGE,
    isLoading: query.isLoading
  }
}
