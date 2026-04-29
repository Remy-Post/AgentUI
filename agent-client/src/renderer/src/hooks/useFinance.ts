import { useQuery } from '@tanstack/react-query'
import type { UsageDTO, UsageWindow } from '@shared/types'
import { apiFetch } from '../lib/api'

export type FinanceWindow = UsageWindow
export type FinanceData = UsageDTO

const EMPTY_BUCKET = { spendUsd: 0, inTokens: 0, outTokens: 0, spark: [] as number[] }

const EMPTY_USAGE: FinanceData = {
  totals: EMPTY_BUCKET,
  today: EMPTY_BUCKET,
  lastHour: EMPTY_BUCKET,
  byModel: [],
  recentRuns: []
}

export function useFinance({ window }: { window: FinanceWindow }): {
  data: FinanceData
  isLoading: boolean
} {
  const query = useQuery({
    queryKey: ['finance', window],
    queryFn: () => apiFetch<UsageDTO>(`/api/usage?window=${encodeURIComponent(window)}`),
    staleTime: 30_000
  })
  return {
    data: query.data ?? EMPTY_USAGE,
    isLoading: query.isLoading
  }
}
