import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, PanelLeftClose } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useAppVersion } from '../hooks/useAppVersion'
import { formatRelativeTime, formatUsd } from '../lib/format'
import JumpNav from './JumpNav'
import StatusDot from './StatusDot'
import type { ConversationDTO } from '@shared/types'

export type SidebarMode =
  | 'chat'
  | 'finance'
  | 'logs'
  | 'memory'
  | 'settings-default'
  | 'settings-skills'
  | 'settings-subagents'

type Props = {
  mode?: SidebarMode
  selectedId?: string | null
  onSelect?: (id: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  /** Optional override for the recent conversations body (used by finance mode). */
  bodySlot?: React.ReactNode
}

function pageLabelFromMode(mode: SidebarMode): string {
  if (mode.startsWith('settings')) return 'settings'
  return mode
}

function ChatSidebarBody({
  selectedId,
  onSelect
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions')
  })
  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<ConversationDTO>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New conversation' })
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onSelect(created._id)
    }
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] })
  })

  return (
    <>
      <button
        type="button"
        className="new-conv"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
      >
        <span className="left">
          <Plus size={14} />
          <span>New conversation</span>
        </span>
        <span className="chrome">⌘N</span>
      </button>
      <div className="recent-cap">
        <span className="cap">Recent</span>
      </div>
      <ul className="conv-list">
        {conversationsQuery.data?.map((c) => (
          <li
            key={c._id}
            className={`conv-item ${selectedId === c._id ? 'active' : ''}`}
            onClick={() => onSelect(c._id)}
          >
            <div className="dot" />
            <div style={{ minWidth: 0 }}>
              <div className="conv-row">
                <div className="conv-title">{c.title}</div>
                <span className="chrome">{formatRelativeTime(c.updatedAt)}</span>
              </div>
              {typeof c.totalCostUsd === 'number' && c.totalCostUsd > 0 && (
                <div className="conv-meta">
                  <span className="chrome mono">{formatUsd(c.totalCostUsd)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="delete-btn"
              title="Delete conversation"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm('Delete this conversation?')) deleteMutation.mutate(c._id)
              }}
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
        {conversationsQuery.isError && (
          <li style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-error)' }}>
            Failed to load conversations.
          </li>
        )}
      </ul>
    </>
  )
}

export default function Sidebar({
  mode = 'chat',
  selectedId = null,
  onSelect,
  onToggleCollapsed,
  bodySlot
}: Props): React.JSX.Element {
  const version = useAppVersion()
  const footText = pageLabelFromMode(mode)

  const showRecentList = mode === 'chat' || mode === 'settings-default'

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-left">
          <div>
            <div className="brand-name">Agent Desk</div>
            <div className="chrome">local · v{version || '—'}</div>
          </div>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            className="side-toggle"
            onClick={onToggleCollapsed}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <PanelLeftClose />
          </button>
        )}
      </div>

      <div className="sidebar-main">
        {bodySlot
          ? bodySlot
          : showRecentList &&
            onSelect && <ChatSidebarBody selectedId={selectedId} onSelect={onSelect} />}
      </div>

      <div className="sidebar-bottom">
        <JumpNav />

        <div className="sidebar-foot">
          <span className="sidebar-page-label">{footText}</span>
          <StatusDot />
        </div>
      </div>
    </aside>
  )
}
