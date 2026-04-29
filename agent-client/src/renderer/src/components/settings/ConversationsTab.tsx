import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, MessageSquare } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { formatRelativeTime, formatUsd } from '../../lib/format'
import type { ConversationDTO } from '@shared/types'
import { useViewStore } from '../../store/view'

type Props = {
  onSelectConversation: (id: string) => void
}

export default function ConversationsTab({ onSelectConversation }: Props): React.JSX.Element {
  const queryClient = useQueryClient()
  const setView = useViewStore((s) => s.setView)

  const { data, isError } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions')
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] })
  })

  const handleSelect = (id: string): void => {
    onSelectConversation(id)
    setView('chat')
  }

  return (
    <div className="settings-pane">
      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">All conversations</div>
          <div className="pane-sub">Manage and revisit your previous conversations.</div>
        </div>
      </div>

      <div className="list-card">
        {data?.map((c) => (
          <div
            key={c._id}
            className="list-row compact selectable"
            onClick={() => handleSelect(c._id)}
          >
            <div className="glyph">
              <MessageSquare size={12} />
            </div>
            <div>
              <div className="name">{c.title}</div>
              <div className="desc">
                {c.model} · {formatRelativeTime(c.updatedAt)}
                {typeof c.totalCostUsd === 'number' &&
                  c.totalCostUsd > 0 &&
                  ` · ${formatUsd(c.totalCostUsd)}`}
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              title="Delete conversation"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Delete this conversation?')) {
                  deleteMutation.mutate(c._id)
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {data?.length === 0 && (
          <div className="list-row compact">
            <div />
            <div className="desc">No conversations found.</div>
            <div />
          </div>
        )}
        {isError && (
          <div className="list-row compact">
            <div />
            <div className="desc" style={{ color: 'var(--color-error)' }}>
              Failed to load conversations.
            </div>
            <div />
          </div>
        )}
      </div>
    </div>
  )
}
