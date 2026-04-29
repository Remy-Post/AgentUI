import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const CONFIG_KEY = (key: string): readonly ['config', string] => ['config', key] as const

export function useConfig<T>(
  key: string,
  defaultValue: T,
): { value: T; setValue: (next: T) => void; isReady: boolean } {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: CONFIG_KEY(key),
    queryFn: async (): Promise<unknown> => {
      const raw = await window.api.getConfig(key)
      return raw === null || raw === undefined ? defaultValue : raw
    },
    staleTime: Infinity,
  })

  const setValue = useCallback(
    (next: T) => {
      queryClient.setQueryData(CONFIG_KEY(key), next)
      void window.api.setConfig(key, next)
    },
    [key, queryClient],
  )

  const value = (query.data as T | undefined) ?? defaultValue
  return { value, setValue, isReady: !query.isPending }
}

export async function readConfigOnce<T>(key: string, fallback: T): Promise<T> {
  const raw = await window.api.getConfig(key)
  return raw === null || raw === undefined ? fallback : (raw as T)
}

export async function persistConfig<T>(key: string, value: T): Promise<void> {
  await window.api.setConfig(key, value)
}
