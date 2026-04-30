import { useState } from 'react'
import { Download, PanelRight } from 'lucide-react'
import EffortToggle from './EffortToggle'
import ContextsChip from './ContextsChip'
import { useKeybindShortcut } from '../hooks/useKeybinds'
import { formatStartedAt } from '../lib/format'
import { apiFetch } from '../lib/api'
import type { ConversationDTO, MessageDTO } from '@shared/types'

type Props = {
  conversation: ConversationDTO
  messages: MessageDTO[]
  inspectorOpen: boolean
  onToggleInspector: () => void
}

type ExportStatus = { kind: 'ok' | 'err'; message: string } | null

type ConversationExport = {
  format: 'agentui.conversation.v1'
  exportedAt: string
  conversation: ConversationDTO
  messages: MessageDTO[]
}

function filenamePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return normalized || 'conversation'
}

function downloadJson(payload: ConversationExport, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8'
  })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'server_not_ready') {
    return 'Server not reachable.'
  }
  return 'Export failed.'
}

export default function ChatHeader({
  conversation,
  messages,
  inspectorOpen,
  onToggleInspector
}: Props): React.JSX.Element {
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>(null)
  const inspectorShortcut = useKeybindShortcut('inspector.toggle')
  const inspectorLabel = inspectorOpen ? 'Hide run inspector' : 'Show run inspector'
  const inspectorTitle = inspectorShortcut
    ? `${inspectorLabel} (${inspectorShortcut})`
    : inspectorLabel

  const exportConversation = async (): Promise<void> => {
    setExportStatus(null)
    setExporting(true)
    try {
      const freshMessages = await apiFetch<MessageDTO[]>(
        `/api/sessions/${conversation._id}/messages`
      )
      downloadJson(
        {
          format: 'agentui.conversation.v1',
          exportedAt: new Date().toISOString(),
          conversation,
          messages: freshMessages
        },
        `agentui-conversation-${filenamePart(conversation.title)}.json`
      )
      setExportStatus({ kind: 'ok', message: 'JSON downloaded.' })
    } catch (error) {
      setExportStatus({
        kind: 'err',
        message: exportErrorMessage(error)
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <header className="chat-header">
      <div style={{ minWidth: 0 }}>
        <div className="chat-title">{conversation.title}</div>
        <div className="chat-sub">
          <span className="chrome">{messages.length} turns</span>
          <span className="chrome">·</span>
          <span className="chrome">started {formatStartedAt(conversation.createdAt)}</span>
          {exportStatus && (
            <>
              <span className="chrome">·</span>
              <span
                className="chrome"
                aria-live="polite"
                style={{ color: exportStatus.kind === 'err' ? 'var(--color-error)' : undefined }}
              >
                {exportStatus.message}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="chips">
        <EffortToggle conversation={conversation} />
        <ContextsChip conversation={conversation} />
        <button
          type="button"
          className="chip button chat-export-button"
          onClick={exportConversation}
          disabled={exporting}
          title="Export conversation as JSON"
        >
          <Download size={12} />
          <span>{exporting ? 'Exporting...' : 'Export JSON'}</span>
        </button>
        <button
          type="button"
          className="inspector-toggle"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
          title={inspectorTitle}
        >
          <PanelRight />
        </button>
      </div>
    </header>
  )
}
