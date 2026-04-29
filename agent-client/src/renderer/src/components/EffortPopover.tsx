import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { ConversationDTO } from '@shared/types'

type Effort = 'low' | 'medium' | 'high'

const OPTIONS: Array<{ id: Effort; label: string }> = [
  { id: 'low', label: 'Low — quick replies' },
  { id: 'medium', label: 'Medium — balanced' },
  { id: 'high', label: 'High — deep work' },
]

type Props = {
  conversation: ConversationDTO
}

export default function EffortPopover({ conversation }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const current = (conversation.effort ?? 'medium') as Effort

  const mutation = useMutation({
    mutationFn: (effort: Effort) =>
      apiFetch<ConversationDTO>(`/api/sessions/${conversation._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ effort }),
      }),
    onMutate: async (effort) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const previous = queryClient.getQueryData<ConversationDTO[]>(['conversations'])
      if (previous) {
        queryClient.setQueryData<ConversationDTO[]>(
          ['conversations'],
          previous.map((c) => (c._id === conversation._id ? { ...c, effort } : c)),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['conversations'], ctx.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (effort: Effort): void => {
    if (effort !== current) mutation.mutate(effort)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button type="button" className="chip button" onClick={() => setOpen((s) => !s)} aria-pressed={open}>
        Effort · {current}
      </button>
      {open && (
        <div className="popover" style={{ top: 'calc(100% + 6px)', right: 0 }} role="dialog">
          {OPTIONS.map((opt) => (
            <label key={opt.id} className="popover-row">
              <input
                type="radio"
                name="effort"
                checked={opt.id === current}
                onChange={() => select(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
