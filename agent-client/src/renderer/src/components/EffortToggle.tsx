import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { ConversationDTO } from '@shared/types'

type Effort = 'low' | 'medium' | 'high'

const ORDER: Effort[] = ['low', 'medium', 'high']

type Props = {
  conversation: ConversationDTO
}

export default function EffortToggle({ conversation }: Props): React.JSX.Element {
  const queryClient = useQueryClient()
  const current = (conversation.effort ?? 'medium') as Effort
  const level = ORDER.indexOf(current) + 1

  const mutation = useMutation({
    mutationFn: (effort: Effort) =>
      apiFetch<ConversationDTO>(`/api/sessions/${conversation._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ effort })
      }),
    onMutate: async (effort) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const previous = queryClient.getQueryData<ConversationDTO[]>(['conversations'])
      if (previous) {
        queryClient.setQueryData<ConversationDTO[]>(
          ['conversations'],
          previous.map((c) => (c._id === conversation._id ? { ...c, effort } : c))
        )
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['conversations'], ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  })

  const cycle = (): void => {
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
    mutation.mutate(next)
  }

  return (
    <button
      type="button"
      className="chip button effort-toggle"
      onClick={cycle}
      title={`Effort: ${current} (click to change)`}
      aria-label={`Effort level ${level} of 3 (${current}). Click to change.`}
    >
      Effort
      <span className="effort-bars" aria-hidden="true">
        <span className={`effort-bar${level >= 1 ? ' on' : ''}`} />
        <span className={`effort-bar${level >= 2 ? ' on' : ''}`} />
        <span className={`effort-bar${level >= 3 ? ' on' : ''}`} />
      </span>
    </button>
  )
}
