import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, PanelRight } from 'lucide-react'
import EffortToggle from './EffortToggle'
import ContextsChip from './ContextsChip'
import { useKeybindAction } from '../hooks/useKeybindAction'
import { useKeybindShortcut } from '../hooks/useKeybinds'
import { formatStartedAt } from '../lib/format'
import { apiFetch } from '../lib/api'
import { isValidTitle } from '../lib/conversationColors'
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
  const queryClient = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<ExportStatus>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(conversation.title)
  const [titleError, setTitleError] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const inspectorShortcut = useKeybindShortcut('chat.toggleInspector')
  const inspectorLabel = inspectorOpen ? 'Hide run inspector' : 'Show run inspector'
  const inspectorTitle = inspectorShortcut
    ? `${inspectorLabel} (${inspectorShortcut})`
    : inspectorLabel

  useEffect(() => {
    if (!editingTitle) setTitleDraft(conversation.title)
  }, [conversation.title, editingTitle])

  useEffect(() => {
    if (!editingTitle) return
    const input = titleInputRef.current
    input?.focus()
    input?.select()
  }, [editingTitle])

  const titleMutation = useMutation({
    mutationFn: (title: string) =>
      apiFetch<ConversationDTO>(`/api/sessions/${conversation._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title })
      }),
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const previous = queryClient.getQueryData<ConversationDTO[]>(['conversations'])
      if (previous) {
        queryClient.setQueryData<ConversationDTO[]>(
          ['conversations'],
          previous.map((c) => (c._id === conversation._id ? { ...c, title } : c))
        )
      }
      return { previous }
    },
    onError: (_err, _title, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['conversations'], ctx.previous)
      setTitleDraft(conversation.title)
      setTitleError('Title save failed.')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  })

  const startTitleEdit = (): void => {
    setTitleError(null)
    setTitleDraft(conversation.title)
    setEditingTitle(true)
  }

  const cancelTitleEdit = (): void => {
    setTitleError(null)
    setTitleDraft(conversation.title)
    setEditingTitle(false)
  }

  const saveTitleEdit = (): void => {
    const trimmed = titleDraft.trim()
    if (trimmed === conversation.title) {
      setTitleError(null)
      setEditingTitle(false)
      return
    }
    if (!isValidTitle(trimmed)) {
      setTitleDraft(conversation.title)
      setTitleError('Title must be at least 4 characters.')
      setEditingTitle(false)
      return
    }
    setTitleError(null)
    setEditingTitle(false)
    titleMutation.mutate(trimmed)
  }

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      cancelTitleEdit()
    }
  }

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

  useKeybindAction('chat.exportConversation', () => {
    if (exporting) return false
    void exportConversation()
    return true
  })

  return (
    <header className="chat-header">
      <div style={{ minWidth: 0 }}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="chat-title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={saveTitleEdit}
            onKeyDown={handleTitleKeyDown}
            aria-label="Conversation title"
            disabled={titleMutation.isPending}
          />
        ) : (
          <div
            className="chat-title"
            role="button"
            tabIndex={0}
            title="Double-click to edit title"
            onDoubleClick={startTitleEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                startTitleEdit()
              }
            }}
          >
            {conversation.title}
          </div>
        )}
        <div className="chat-sub">
          <span className="chrome">{messages.length} turns</span>
          <span className="chrome">·</span>
          <span className="chrome">started {formatStartedAt(conversation.createdAt)}</span>
          {titleMutation.isPending && (
            <>
              <span className="chrome">·</span>
              <span className="chrome" aria-live="polite">
                Saving title…
              </span>
            </>
          )}
          {titleError && (
            <>
              <span className="chrome">·</span>
              <span className="chrome" aria-live="polite" style={{ color: 'var(--color-error)' }}>
                {titleError}
              </span>
            </>
          )}
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
          <span className="app-text">{exporting ? 'Exporting...' : 'Export JSON'}</span>
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
