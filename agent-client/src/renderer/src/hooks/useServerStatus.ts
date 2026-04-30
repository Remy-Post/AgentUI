import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { HealthDTO } from '@shared/types'

export type ServerStatus =
  | 'connected'
  | 'server-unreachable'
  | 'db-down'
  | 'sdk-not-ready'
  | 'checking'

export function useServerStatus(): ServerStatus {
  const query = useQuery({
    queryKey: ['server-health'],
    queryFn: async (): Promise<Exclude<ServerStatus, 'checking'>> => {
      try {
        const health = await apiFetch<HealthDTO>('/health')
        if (health.db !== 'up') return 'db-down'
        if (health.sdk !== 'ready') return 'sdk-not-ready'
        return 'connected'
      } catch {
        return 'server-unreachable'
      }
    },
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    staleTime: 5000
  })

  if (query.isPending) return 'checking'
  return query.data ?? 'server-unreachable'
}
