import { useQuery } from '@tanstack/react-query'
import Sidebar from '../Sidebar'
import { apiFetch } from '../../lib/api'
import { formatUsd } from '../../lib/format'
import type { ConversationDTO } from '@shared/types'

type Props = {
  selectedConversationId: string | null
  onSelect: (id: string | null) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export default function FinanceSidebar({
  selectedConversationId,
  onSelect,
  collapsed,
  onToggleCollapsed
}: Props): React.JSX.Element {
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions')
  })

  const top = (conversationsQuery.data ?? [])
    .slice()
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))

  const body = (
    <>
      <div className="recent-cap">
        <span className="cap">Top conversations · this month</span>
      </div>
      <ul className="conv-list">
        {top.map((c) => (
          <li
            key={c._id}
            className={`conv-item ${selectedConversationId === c._id ? 'active' : ''}`}
            onClick={() => onSelect(c._id)}
          >
            <div className="dot" />
            <div style={{ minWidth: 0 }}>
              <div className="conv-row">
                <div className="conv-title">{c.title}</div>
              </div>
              <div className="conv-meta">
                <span className="chrome mono">{formatUsd(c.totalCostUsd ?? 0)}</span>
              </div>
            </div>
          </li>
        ))}
        {top.length === 0 && (
          <li style={{ padding: '12px 16px' }}>
            <span className="chrome">no conversations yet</span>
          </li>
        )}
      </ul>
    </>
  )

  return (
    <Sidebar
      mode="finance"
      bodySlot={body}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  )
}
