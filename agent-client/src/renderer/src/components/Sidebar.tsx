import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings, Trash2 } from 'lucide-react'
import { apiFetch } from '../lib/api'
import type { ConversationDTO } from '@shared/types'

type Props = {
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenSettings: () => void
}

export default function Sidebar({ selectedId, onSelect, onOpenSettings }: Props): React.JSX.Element {
  const queryClient = useQueryClient()

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<ConversationDTO>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New conversation' }),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onSelect(created._id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between p-3">
        <h1 className="text-sm font-semibold tracking-wide text-zinc-300">Agent Desk</h1>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        className="mx-3 flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
      >
        <Plus size={14} /> New conversation
      </button>

      <ul className="mt-3 flex-1 overflow-y-auto px-2">
        {conversationsQuery.data?.map((c) => (
          <li key={c._id}>
            <button
              type="button"
              onClick={() => onSelect(c._id)}
              className={`group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                selectedId === c._id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <span className="truncate">{c.title}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Delete this conversation?')) deleteMutation.mutate(c._id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (confirm('Delete this conversation?')) deleteMutation.mutate(c._id)
                  }
                }}
                className="invisible rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-red-400 group-hover:visible"
                title="Delete"
              >
                <Trash2 size={12} />
              </span>
            </button>
          </li>
        ))}
        {conversationsQuery.isError && (
          <li className="px-2 py-2 text-xs text-red-400">Failed to load conversations.</li>
        )}
      </ul>
    </aside>
  )
}
