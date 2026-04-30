import { useQuery } from '@tanstack/react-query'
import { getServerHealth, getServerOrigin } from '../lib/api'
import type { HealthDTO } from '@shared/types'

export type ServerStatus =
  | 'connected'
  | 'server-unreachable'
  | 'db-down'
  | 'sdk-not-ready'
  | 'checking'

export type ServerConnection = {
  status: ServerStatus
  origin: string | null
  health: HealthDTO | undefined
  isReady: boolean
  isChecking: boolean
  refetch: () => void
}

function statusFromHealth(health: HealthDTO): Exclude<ServerStatus, 'checking' | 'server-unreachable'> {
  if (health.db !== 'up') return 'db-down'
  if (health.sdk !== 'ready') return 'sdk-not-ready'
  return 'connected'
}

export function useServerConnection(): ServerConnection {
  const query = useQuery({
    queryKey: ['server-health'],
    queryFn: async ({ signal }): Promise<HealthDTO> => getServerHealth(signal),
    refetchInterval: (queryState) => {
      const health = queryState.state.data
      return health && statusFromHealth(health) === 'connected' ? 8000 : 2000
    },
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 5000
  })

  const status: ServerStatus = query.isPending
    ? 'checking'
    : query.isError || !query.data
      ? 'server-unreachable'
      : statusFromHealth(query.data)

  return {
    status,
    origin: getServerOriginSync(),
    health: query.data,
    isReady: status === 'connected',
    isChecking: query.isFetching,
    refetch: () => {
      void query.refetch()
    }
  }
}

function getServerOriginSync(): string | null {
  const configured = import.meta.env.VITE_AGENT_SERVER_URL?.trim()
  return (configured || 'http://127.0.0.1:3001').replace(/\/+$/, '')
}

export function useServerStatus(): ServerStatus {
  return useServerConnection().status
}
