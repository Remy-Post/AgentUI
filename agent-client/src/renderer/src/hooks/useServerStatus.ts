import { useQuery } from '@tanstack/react-query'
import { getServerOrigin } from '../lib/api'

export type ServerStatus = 'connected' | 'disconnected' | 'checking'

export function useServerStatus(): ServerStatus {
  const query = useQuery({
    queryKey: ['server-health'],
    queryFn: async (): Promise<'connected' | 'disconnected'> => {
      const origin = await getServerOrigin()
      if (!origin) return 'disconnected'
      try {
        const res = await fetch(`${origin}/health`)
        return res.ok ? 'connected' : 'disconnected'
      } catch {
        return 'disconnected'
      }
    },
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  })

  if (query.isPending) return 'checking'
  return query.data ?? 'disconnected'
}
