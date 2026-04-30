import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const CONFIG_KEY = (key: string): readonly ['config', string] => ['config', key] as const
const STORAGE_PREFIX = 'agent-web:config:'

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

function readStoredConfig<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storageKey(key))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStoredConfig<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    // Ignore storage failures; in-memory query state still updates.
  }
}

export function useConfig<T>(
  key: string,
  defaultValue: T
): { value: T; setValue: (next: T) => void; isReady: boolean } {
  const queryClient = useQueryClient()
  const query = useQuery<T>({
    queryKey: CONFIG_KEY(key),
    queryFn: () => readStoredConfig(key, defaultValue),
    staleTime: Infinity
  })

  const setValue = useCallback(
    (next: T) => {
      queryClient.setQueryData(CONFIG_KEY(key), next)
      writeStoredConfig(key, next)
    },
    [key, queryClient]
  )

  return { value: query.data ?? defaultValue, setValue, isReady: !query.isPending }
}

export function useBooleanConfig(
  key: string,
  defaultValue: boolean
): { value: boolean; setValue: (next: boolean) => void; toggle: () => void; isReady: boolean } {
  const { value, setValue, isReady } = useConfig<boolean>(key, defaultValue)
  const toggle = useCallback(() => setValue(!value), [setValue, value])
  return { value, setValue, toggle, isReady }
}

export async function readConfigOnce<T>(key: string, fallback: T): Promise<T> {
  return readStoredConfig(key, fallback)
}

export async function persistConfig<T>(key: string, value: T): Promise<void> {
  writeStoredConfig(key, value)
}
