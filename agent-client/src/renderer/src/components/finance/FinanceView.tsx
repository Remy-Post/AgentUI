import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import SparkBars from './SparkBars'
import ConversationDrillDown from './ConversationDrillDown'
import ModelsPopover, { ALL_MODEL_IDS } from './ModelsPopover'
import WindowToggle from './WindowToggle'
import { useFinance, type FinanceWindow } from '../../hooks/useFinance'
import { useKeybindAction } from '../../hooks/useKeybindAction'
import { apiFetch, getServerUrl } from '../../lib/api'
import { formatModelFamily, formatUsd } from '../../lib/format'
import type { ConversationDTO, UsageBucket } from '@shared/types'

type CardGranularity = 'day' | 'hour'

function formatBucketLabel(iso: string, granularity: CardGranularity): string {
  const d = new Date(iso)
  if (granularity === 'hour') {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' })
}

function UsageCard({
  label,
  granularity,
  bucket
}: {
  label: string
  granularity: CardGranularity
  bucket: UsageBucket
}): React.JSX.Element {
  const last = bucket.spark.length - 1
  const [selected, setSelected] = useState<number | null>(null)
  // Defensive clamp on render in case spark length changes after a refresh.
  const clamped = selected != null && selected > last ? last : selected

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (last < 0) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSelected((i) => (i == null ? last : Math.max(0, i - 1)))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setSelected((i) => (i == null ? last : Math.min(last, i + 1)))
    } else if (e.key === 'Escape') {
      setSelected(null)
    }
  }

  const cap =
    clamped != null && bucket.bucketStarts[clamped]
      ? formatBucketLabel(bucket.bucketStarts[clamped], granularity)
      : label
  const value = clamped != null ? (bucket.spark[clamped] ?? 0) : bucket.spendUsd

  return (
    <div
      className="stat-card stat-card-interactive"
      tabIndex={0}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      onBlur={() => setSelected(null)}
    >
      <div className="stat-cap">{cap}</div>
      <div className="stat-value" aria-live="polite">
        {formatUsd(value)}
      </div>
      <div className="stat-sub">
        <strong>{bucket.inTokens.toLocaleString()}</strong> in ·{' '}
        <strong>{bucket.outTokens.toLocaleString()}</strong> out
      </div>
      <SparkBars
        values={bucket.spark}
        selectedIndex={clamped}
        onSelect={(i) => setSelected(i)}
      />
    </div>
  )
}

const MODEL_DOT_COLORS: Record<string, string> = {
  'claude-sonnet-4': 'var(--color-ink)',
  'claude-opus-4': 'var(--color-ink-3)',
  'claude-haiku-4-5': 'var(--color-line-2)'
}

type Props = {
  windowValue: FinanceWindow
  setWindow: (w: FinanceWindow) => void
  selectedConversationId: string | null
  onClearSelection: () => void
}

const WINDOW_LABEL: Record<FinanceWindow, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  all: 'ALL'
}

const WINDOW_ORDER: FinanceWindow[] = ['24h', '7d', '30d', 'all']

type ExportStatus = { kind: 'ok' | 'err'; message: string } | null

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      return encoded[1]
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(disposition)
  if (quoted?.[1]) return quoted[1]
  const bare = /filename=([^;]+)/i.exec(disposition)
  return bare?.[1]?.trim() ?? null
}

function downloadCsv(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
}

export default function FinanceView({
  windowValue,
  setWindow,
  selectedConversationId,
  onClearSelection
}: Props): React.JSX.Element {
  const [selectedModels, setSelectedModels] = useState<string[]>(ALL_MODEL_IDS)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>(null)
  const { data } = useFinance({ window: windowValue, models: selectedModels })
  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions')
  })
  const conversation =
    conversationsQuery.data?.find((c) => c._id === selectedConversationId) ?? null

  const exportCsv = async (): Promise<void> => {
    setExportStatus(null)
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (selectedConversationId) {
        params.set('conversationId', selectedConversationId)
      } else {
        params.set('window', windowValue)
        if (selectedModels.length > 0 && selectedModels.length < ALL_MODEL_IDS.length) {
          params.set('models', selectedModels.join(','))
        }
      }

      const query = params.toString()
      let exportUrl: string
      try {
        exportUrl = await getServerUrl(`/api/usage/export.csv${query ? `?${query}` : ''}`)
      } catch {
        throw new Error('Server not reachable.')
      }

      const res = await fetch(exportUrl)
      if (!res.ok) {
        throw new Error(`Export failed (${res.status}).`)
      }

      const blob = await res.blob()
      const filename =
        filenameFromDisposition(res.headers.get('Content-Disposition')) ??
        `agentui-usage-${selectedConversationId ? 'conversation' : windowValue}.csv`
      downloadCsv(blob, filename)
      setExportStatus({ kind: 'ok', message: 'CSV downloaded.' })
    } catch (error) {
      setExportStatus({
        kind: 'err',
        message: error instanceof Error ? error.message : 'Export failed.'
      })
    } finally {
      setExporting(false)
    }
  }

  useKeybindAction(
    ['finance.cycleWindow', 'finance.exportCsv', 'finance.clearConversationSelection'],
    (actionId) => {
      if (actionId === 'finance.cycleWindow') {
        const next = WINDOW_ORDER[(WINDOW_ORDER.indexOf(windowValue) + 1) % WINDOW_ORDER.length]
        setWindow(next)
        return true
      }
      if (actionId === 'finance.exportCsv') {
        if (exporting) return false
        void exportCsv()
        return true
      }
      if (actionId === 'finance.clearConversationSelection') {
        if (!selectedConversationId) return false
        onClearSelection()
        return true
      }
      return false
    }
  )

  return (
    <section className="settings-section">
      <header className="settings-header">
        <div>
          <div className="settings-title">Finance</div>
          <div className="chrome" style={{ marginTop: 4 }}>
            local meter · aggregated from this device
            {exportStatus && (
              <span style={{ color: exportStatus.kind === 'err' ? 'var(--color-error)' : undefined }}>
                {' '}
                · {exportStatus.message}
              </span>
            )}
          </div>
        </div>
        <div className="chips finance-header-actions">
          <ModelsPopover
            selected={selectedModels}
            onChange={setSelectedModels}
            buttonClassName="finance-header-control"
          />
          <WindowToggle
            value={windowValue}
            onChange={setWindow}
            className="finance-header-control"
          />
          <button
            type="button"
            className="btn-secondary finance-header-control"
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
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
                  Aggregated from this device&apos;s conversation history. The Anthropic console is
                  the source of truth for billing.
                </div>
              </div>
            </div>

            <div className="stat-grid">
              <UsageCard
                label="Monthly · last 30 days"
                granularity="day"
                bucket={data.monthly}
              />
              <UsageCard
                label="Weekly · last 7 days"
                granularity="day"
                bucket={data.weekly}
              />
              <UsageCard
                label="Hourly · last 24 hours"
                granularity="hour"
                bucket={data.hourly}
              />
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
                    <span>{formatModelFamily(row.model)}</span>
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
                  <div
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {run.title}
                  </div>
                  <div className="num">{run.tokens.toLocaleString()}</div>
                  <div className="num">{formatModelFamily(run.model)}</div>
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
