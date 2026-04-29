// TODO: replace with /api/usage when backend lands.
import { useMemo } from 'react'
import { buildFinanceData, type FinanceData, type FinanceWindow } from '../lib/financeMock'

export function useFinance({ window }: { window: FinanceWindow }): {
  data: FinanceData
  isLoading: boolean
} {
  const data = useMemo(() => buildFinanceData(window), [window])
  return { data, isLoading: false }
}

export type { FinanceWindow, FinanceData }
