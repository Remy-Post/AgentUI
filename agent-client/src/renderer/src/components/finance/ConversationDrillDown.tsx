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

type PerTurnRow = {
  id: string
  turn: number
  inputTokens?: number
  outputTokens?: number
  model?: string
  costUsd?: number
}

function rowTokens(row: PerTurnRow): number | null {
  if (typeof row.inputTokens !== 'number' && typeof row.outputTokens !== 'number') return null
  return (row.inputTokens ?? 0) + (row.outputTokens ?? 0)
}

export default function ConversationDrillDown({
  conversationId,
  conversation,
  onBack
}: Props): React.JSX.Element {
  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiFetch<MessageDTO[]>(`/api/sessions/${conversationId}/messages`)
  })

  const messages = messagesQuery.data ?? []
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  const totalCost = conversation?.totalCostUsd ?? 0
  const perTurnRows: PerTurnRow[] = useMemo(
    () =>
      assistantMessages.map((m, i) => ({
        id: m._id,
        turn: i + 1,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        model: m.model,
        costUsd: m.costUsd
      })),
    [assistantMessages]
  )

  const visibleTokenSum = perTurnRows.reduce((acc, r) => {
    const t = rowTokens(r)
    return typeof t === 'number' ? acc + t : acc
  }, 0)
  const conversationTokenTotal =
    (conversation?.totalInputTokens ?? 0) + (conversation?.totalOutputTokens ?? 0)
  const includesSubagent = conversationTokenTotal > visibleTokenSum
  const totalTokens = conversationTokenTotal > 0 ? conversationTokenTotal : visibleTokenSum
  const avgCost = perTurnRows.length > 0 ? totalCost / perTurnRows.length : 0

  return (
    <div className="settings-pane">
      <button type="button" className="btn-secondary" style={{ marginBottom: 18 }} onClick={onBack}>
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
          <div className="stat-sub">
            {includesSubagent ? 'includes subagent activity' : 'sum of recorded turns'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-cap">Avg cost / turn</div>
          <div className="stat-value">{formatUsd(avgCost)}</div>
          <div className="stat-sub">conversation total / turns</div>
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
            <div className="num">not recorded</div>
            <div className="num">not recorded</div>
            <div className="num">not recorded</div>
          </div>
        )}
        {perTurnRows.map((row) => {
          const tokens = rowTokens(row)
          const model = row.model ?? conversation?.model ?? 'not recorded'
          return (
            <div key={row.id} className="breakdown-row">
              <div>#{row.turn}</div>
              <div className="num">
                {tokens === null ? 'not recorded' : tokens.toLocaleString()}
              </div>
              <div className="num">{model}</div>
              <div className="num">
                {typeof row.costUsd === 'number' ? formatUsd(row.costUsd) : 'not recorded'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
