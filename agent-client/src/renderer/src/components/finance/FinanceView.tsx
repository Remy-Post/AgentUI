import { useQuery } from '@tanstack/react-query'
import SparkBars from './SparkBars'
import ConversationDrillDown from './ConversationDrillDown'
import { useFinance, type FinanceWindow } from '../../hooks/useFinance'
import { apiFetch } from '../../lib/api'
import { formatUsd } from '../../lib/format'
import type { ConversationDTO } from '@shared/types'

const MODEL_DOT_COLORS: Record<string, string> = {
  'claude-sonnet-4': 'var(--color-ink)',
  'claude-opus-4': 'var(--color-ink-3)',
  'claude-haiku-4-5': 'var(--color-line-2)',
}

type Props = {
  windowValue: FinanceWindow
  setWindow: (w: FinanceWindow) => void
  selectedConversationId: string | null
  onClearSelection: () => void
}

const WINDOW_LABEL: Record<FinanceWindow, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'This month',
  all: 'All time',
}

export default function FinanceView({
  windowValue,
  setWindow,
  selectedConversationId,
  onClearSelection,
}: Props): React.JSX.Element {
  const { data } = useFinance({ window: windowValue })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions'),
  })
  const conversation = conversationsQuery.data?.find((c) => c._id === selectedConversationId) ?? null

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div>
          <div className="settings-title">Finance</div>
          <div className="chrome" style={{ marginTop: 4 }}>
            local meter · mock data this pass
          </div>
        </div>
        <div className="chips">
          <span className="chip">claude · all models</span>
          <select
            className="select"
            value={windowValue}
            onChange={(e) => setWindow(e.target.value as FinanceWindow)}
            style={{ width: 'auto' }}
          >
            {(Object.keys(WINDOW_LABEL) as FinanceWindow[]).map((w) => (
              <option key={w} value={w}>
                {WINDOW_LABEL[w]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              // TODO: export usage CSV when /api/usage exists.
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      <div className="settings-body">
        {selectedConversationId ? (
          <ConversationDrillDown
            conversationId={selectedConversationId}
            conversation={conversation}
            onBack={onClearSelection}
          />
        ) : (
          <div className="settings-pane">
            <div className="pane-head">
              <div className="pane-head-text">
                <div className="pane-title">Spend & token consumption</div>
                <div className="pane-sub">
                  Local meter. Reads from <span className="mono">~/.agentdesk/usage.sqlite</span> when wired up.
                  The Anthropic console is the source of truth for billing.
                </div>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-cap">Total · {WINDOW_LABEL[windowValue]}</div>
                <div className="stat-value">{formatUsd(data.totals.spendUsd)}</div>
                <div className="stat-sub">
                  <strong>{data.totals.inTokens.toLocaleString()}</strong> in ·{' '}
                  <strong>{data.totals.outTokens.toLocaleString()}</strong> out
                </div>
                <SparkBars values={data.totals.spark} />
              </div>
              <div className="stat-card">
                <div className="stat-cap">Today</div>
                <div className="stat-value">{formatUsd(data.today.spendUsd)}</div>
                <div className="stat-sub">
                  <strong>{data.today.inTokens.toLocaleString()}</strong> in ·{' '}
                  <strong>{data.today.outTokens.toLocaleString()}</strong> out
                </div>
                <SparkBars values={data.today.spark} />
              </div>
              <div className="stat-card">
                <div className="stat-cap">Last hour</div>
                <div className="stat-value">{formatUsd(data.lastHour.spendUsd)}</div>
                <div className="stat-sub">
                  <strong>{data.lastHour.inTokens.toLocaleString()}</strong> in ·{' '}
                  <strong>{data.lastHour.outTokens.toLocaleString()}</strong> out
                </div>
                <SparkBars values={data.lastHour.spark} />
              </div>
            </div>

            <div className="breakdown-card">
              <div className="breakdown-head">
                <div className="name">Breakdown by model</div>
                <span className="chrome">{WINDOW_LABEL[windowValue]}</span>
              </div>
              <div className="breakdown-row head">
                <div>Model</div>
                <div className="num">In tok</div>
                <div className="num">Out tok</div>
                <div className="num">Spend</div>
              </div>
              {data.byModel.map((row) => (
                <div key={row.model} className="breakdown-row">
                  <div className="label-with-dot">
                    <span
                      className="model-dot"
                      style={{ background: MODEL_DOT_COLORS[row.model] ?? 'var(--color-line-2)' }}
                    />
                    <span>{row.model}</span>
                  </div>
                  <div className="num">{row.inTokens.toLocaleString()}</div>
                  <div className="num">{row.outTokens.toLocaleString()}</div>
                  <div className="num">{formatUsd(row.spendUsd)}</div>
                </div>
              ))}
            </div>

            <div className="breakdown-card">
              <div className="breakdown-head">
                <div className="name">Recent runs</div>
                <span className="chrome">last 12</span>
              </div>
              <div className="breakdown-row head">
                <div>Conversation</div>
                <div className="num">Tokens</div>
                <div className="num">Model</div>
                <div className="num">Cost</div>
              </div>
              {data.recentRuns.map((run) => (
                <div key={run.id} className="breakdown-row">
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.title}
                  </div>
                  <div className="num">{run.tokens.toLocaleString()}</div>
                  <div className="num">{run.model}</div>
                  <div className="num">{formatUsd(run.spendUsd)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
