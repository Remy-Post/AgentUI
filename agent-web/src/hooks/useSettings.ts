import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SettingsDTO, UpdateSettingsRequest } from '@shared/types'
import { apiFetch } from '../lib/api'

export function useSettings(options: { enabled?: boolean } = {}): {
  data: SettingsDTO | undefined
  isLoading: boolean
  update: (partial: UpdateSettingsRequest) => void
  updateAsync: (partial: UpdateSettingsRequest) => Promise<SettingsDTO>
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
    enabled: options.enabled ?? true,
    staleTime: 30_000
  })

  const mutation = useMutation({
    mutationFn: (partial: UpdateSettingsRequest) =>
      apiFetch<SettingsDTO>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(partial)
      }),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<SettingsDTO>(['settings'])
      if (previous) {
        queryClient.setQueryData<SettingsDTO>(['settings'], { ...previous, ...partial })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['settings'], ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    }
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    update: (partial) => mutation.mutate(partial),
    updateAsync: (partial) => mutation.mutateAsync(partial)
  }
}
