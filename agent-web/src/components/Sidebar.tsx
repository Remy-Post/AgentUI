import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, PanelLeftClose, List } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useAppVersion } from '../hooks/useAppVersion'
import { useKeybindShortcut } from '../hooks/useKeybinds'
import { formatRelativeTime, formatUsd } from '../lib/format'
import { CONVERSATION_COLORS } from '../lib/conversationColors'
import EditConversationModal from './EditConversationModal'
import DeleteConversationModal from './DeleteConversationModal'
import JumpNav from './JumpNav'
import StatusDot from './StatusDot'
import Modal from './Modal'
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

const SIDEBAR_CONVERSATION_LIMIT = 6

function pageLabelFromMode(mode: SidebarMode): string {
  if (mode === 'settings') return 'settings'
  if (mode === 'memory') return 'notes'
  return mode
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  onEdit,
  onDelete
}: {
  conversation: ConversationDTO
  selected: boolean
  onSelect: () => void
  onEdit?: () => void
  onDelete?: () => void
}): React.JSX.Element {
  const tint = conversation.color ? CONVERSATION_COLORS[conversation.color].side : null
  const itemStyle = tint
    ? ({ ['--row-tint' as string]: tint } as React.CSSProperties)
    : undefined
  const showActions = Boolean(onEdit || onDelete)

  return (
    <li
      className={`conv-item ${selected ? 'active' : ''} ${conversation.color ? 'tinted' : ''}`}
      style={itemStyle}
      onClick={onSelect}
    >
      <div className="dot" />
      <div className="conv-body">
        <div className="conv-row">
          <div className="conv-title">{conversation.title}</div>
          {showActions && (
            <div className="conv-actions">
              {onEdit && (
                <button
                  type="button"
                  className="row-icon-btn"
                  title="Edit conversation"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                >
                  <Pencil size={12} />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="row-icon-btn danger"
                  title="Delete conversation"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
          <span className="chrome conv-time">{formatRelativeTime(conversation.updatedAt)}</span>
        </div>
        {typeof conversation.totalCostUsd === 'number' && conversation.totalCostUsd > 0 && (
          <div className="conv-meta">
            <span className="chrome mono">{formatUsd(conversation.totalCostUsd)}</span>
          </div>
        )}
      </div>
    </li>
  )
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
  const [allConversationsOpen, setAllConversationsOpen] = useState(false)
  const conversations = conversationsQuery.data ?? []
  const recentConversations = conversations.slice(0, SIDEBAR_CONVERSATION_LIMIT)
  const hiddenCount = Math.max(0, conversations.length - SIDEBAR_CONVERSATION_LIMIT)

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
        {recentConversations.map((c) => (
          <ConversationRow
            key={c._id}
            conversation={c}
            selected={selectedId === c._id}
            onSelect={() => onSelect(c._id)}
            onEdit={() => setEditing(c)}
            onDelete={() => setDeleting(c)}
          />
        ))}
        {conversationsQuery.isError && (
          <li style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-error)' }}>
            Failed to load conversations.
          </li>
        )}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="conv-load-more"
          onClick={() => setAllConversationsOpen(true)}
        >
          <span className="left">
            <List size={13} />
            <span>Load more</span>
          </span>
          <span className="chrome">{hiddenCount} more</span>
        </button>
      )}
      <Modal
        open={allConversationsOpen}
        onClose={() => setAllConversationsOpen(false)}
        title="All conversations"
      >
        <div className="conversation-modal-meta">
          <span className="cap">{conversations.length} conversations</span>
        </div>
        <ul className="conversation-modal-list">
          {conversations.map((c) => (
            <ConversationRow
              key={c._id}
              conversation={c}
              selected={selectedId === c._id}
              onSelect={() => {
                onSelect(c._id)
                setAllConversationsOpen(false)
              }}
            />
          ))}
        </ul>
      </Modal>
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
