import { useQuery } from '@tanstack/react-query'
import { getServerOrigin } from '../lib/api'
import type { HealthDTO } from '@shared/types'

export type ServerStatus = 'connected' | 'server-unreachable' | 'db-down' | 'sdk-not-ready' | 'checking'

export function useServerStatus(): ServerStatus {
  const query = useQuery({
    queryKey: ['server-health'],
    queryFn: async (): Promise<Exclude<ServerStatus, 'checking'>> => {
      const origin = await getServerOrigin()
      if (!origin) return 'server-unreachable'
      try {
        const res = await fetch(`${origin}/health`)
        if (!res.ok) return 'server-unreachable'
        const health = (await res.json()) as HealthDTO
        if (health.db !== 'up') return 'db-down'
        if (health.sdk !== 'ready') return 'sdk-not-ready'
        return 'connected'
      } catch {
        return 'server-unreachable'
      }
    },
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  })

  if (query.isPending) return 'checking'
  return query.data ?? 'server-unreachable'
}
