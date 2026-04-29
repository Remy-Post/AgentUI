import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { formatUsd } from '../../lib/format'
import type { ConversationDTO, MessageDTO } from '@shared/types'

type Props = {
  conversationId: string
  conversation: ConversationDTO | null
  onBack: () => void
}

export default function ConversationDrillDown({
  conversationId,
  conversation,
  onBack,
}: Props): React.JSX.Element {
  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiFetch<MessageDTO[]>(`/api/sessions/${conversationId}/messages`),
  })

  const messages = messagesQuery.data ?? []
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  const totalCost = conversation?.totalCostUsd ?? 0
  const perTurnRows = useMemo(() => {
    const total = assistantMessages.length
    if (total === 0) return []
    return assistantMessages.map((m, i) => {
      const cost = typeof m.costUsd === 'number' && m.costUsd > 0 ? m.costUsd : totalCost / total
      const tokens = typeof m.content === 'string' ? Math.round(m.content.length / 4) : 0
      return { id: m._id, turn: i + 1, tokens, cost }
    })
    // TODO: wire per-turn cost when MessageDTO exposes it
  }, [assistantMessages, totalCost])

  const totalTokens = perTurnRows.reduce((acc, r) => acc + r.tokens, 0)
  const avgCost = perTurnRows.length > 0 ? totalCost / perTurnRows.length : 0

  return (
    <div className="settings-pane">
      <button
        type="button"
        className="btn-secondary"
        style={{ marginBottom: 18 }}
        onClick={onBack}
      >
        <ArrowLeft size={12} /> Back to overview
      </button>

      <div className="pane-head">
        <div className="pane-head-text">
          <div className="pane-title">{conversation?.title ?? 'Conversation'}</div>
          <div className="pane-sub">
            {conversation?.model ?? 'unknown'} · {assistantMessages.length} assistant turns
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-cap">Total spend</div>
          <div className="stat-value">{formatUsd(totalCost)}</div>
          <div className="stat-sub">across {assistantMessages.length} turns</div>
        </div>
        <div className="stat-card">
          <div className="stat-cap">Total tokens</div>
          <div className="stat-value">{totalTokens.toLocaleString()}</div>
          <div className="stat-sub">est. from assistant text</div>
        </div>
        <div className="stat-card">
          <div className="stat-cap">Avg cost / turn</div>
          <div className="stat-value">{formatUsd(avgCost)}</div>
          <div className="stat-sub">
            <strong>spread evenly</strong> when per-turn cost not tracked
          </div>
        </div>
      </div>

      <div className="breakdown-card">
        <div className="breakdown-head">
          <div className="name">Per-turn breakdown</div>
          <span className="chrome">last {perTurnRows.length} turns</span>
        </div>
        <div className="breakdown-row head">
          <div>Turn</div>
          <div className="num">Tokens</div>
          <div className="num">Model</div>
          <div className="num">Cost</div>
        </div>
        {perTurnRows.length === 0 && (
          <div className="breakdown-row">
            <div className="chrome">no assistant turns yet</div>
            <div className="num">—</div>
            <div className="num">—</div>
            <div className="num">—</div>
          </div>
        )}
        {perTurnRows.map((row) => (
          <div key={row.id} className="breakdown-row">
            <div>#{row.turn}</div>
            <div className="num">{row.tokens.toLocaleString()}</div>
            <div className="num">{conversation?.model ?? '—'}</div>
            <div className="num">{formatUsd(row.cost)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
