import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, PanelLeftClose } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useAppVersion } from '../hooks/useAppVersion'
import { useKeybindShortcut } from '../hooks/useKeybinds'
import { formatRelativeTime, formatUsd } from '../lib/format'
import { CONVERSATION_COLORS } from '../lib/conversationColors'
import EditConversationModal from './EditConversationModal'
import DeleteConversationModal from './DeleteConversationModal'
import JumpNav from './JumpNav'
import StatusDot from './StatusDot'
import type { ConversationDTO } from '@shared/types'

export type SidebarMode =
  | 'chat'
  | 'finance'
  | 'logs'
  | 'memory'
  | 'settings'

type Props = {
  mode?: SidebarMode
  selectedId?: string | null
  onSelect?: (id: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  /** Optional override for the sidebar body. */
  bodySlot?: React.ReactNode
}

function pageLabelFromMode(mode: SidebarMode): string {
  if (mode === 'settings') return 'settings'
  if (mode === 'memory') return 'notes'
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
  const newConversationShortcut = useKeybindShortcut('chat.newConversation')
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

  const [editing, setEditing] = useState<ConversationDTO | null>(null)
  const [deleting, setDeleting] = useState<ConversationDTO | null>(null)

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
        {newConversationShortcut && <span className="chrome">{newConversationShortcut}</span>}
      </button>
      <div className="recent-cap">
        <span className="cap">Recent</span>
      </div>
      <ul className="conv-list">
        {conversationsQuery.data?.map((c) => {
          const tint = c.color ? CONVERSATION_COLORS[c.color].side : null
          const itemStyle = tint
            ? ({ ['--row-tint' as string]: tint } as React.CSSProperties)
            : undefined
          return (
            <li
              key={c._id}
              className={`conv-item ${selectedId === c._id ? 'active' : ''} ${
                c.color ? 'tinted' : ''
              }`}
              style={itemStyle}
              onClick={() => onSelect(c._id)}
            >
              <div className="dot" />
              <div className="conv-body">
                <div className="conv-row">
                  <div className="conv-title">{c.title}</div>
                  <div className="conv-actions">
                    <button
                      type="button"
                      className="row-icon-btn"
                      title="Edit conversation"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditing(c)
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="row-icon-btn danger"
                      title="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleting(c)
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <span className="chrome conv-time">{formatRelativeTime(c.updatedAt)}</span>
                </div>
                {typeof c.totalCostUsd === 'number' && c.totalCostUsd > 0 && (
                  <div className="conv-meta">
                    <span className="chrome mono">{formatUsd(c.totalCostUsd)}</span>
                  </div>
                )}
              </div>
            </li>
          )
        })}
        {conversationsQuery.isError && (
          <li style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-error)' }}>
            Failed to load conversations.
          </li>
        )}
      </ul>
      <EditConversationModal
        open={!!editing}
        onClose={() => setEditing(null)}
        conversation={editing}
      />
      <DeleteConversationModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        conversation={deleting}
      />
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

  const showRecentList = mode === 'chat'

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
