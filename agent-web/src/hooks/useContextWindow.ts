import { useQuery } from '@tanstack/react-query'
import type { ContextDTO } from '@shared/types'
import { apiFetch } from '../lib/api'

export function useContextWindow(conversationId: string | null): {
  data: ContextDTO | undefined
  isLoading: boolean
} {
  const query = useQuery({
    queryKey: ['context', conversationId],
    queryFn: () => apiFetch<ContextDTO>(`/api/sessions/${conversationId}/context`),
    enabled: !!conversationId,
    staleTime: 5_000,
  })
  return { data: query.data, isLoading: query.isLoading }
}
