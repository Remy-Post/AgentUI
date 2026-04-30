import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import MessageList from './MessageList'
import Composer from './Composer'
import ChatHeader from './ChatHeader'
import { apiFetch } from '../lib/api'
import { useKeybindAction } from '../hooks/useKeybindAction'
import { streamPost } from '../hooks/useSSE'
import { useStreamingStore } from '../store/streaming'
import type { CompressResponse, ConversationDTO, MessageDTO, TurnMode } from '@shared/types'

type Props = {
  conversationId: string | null
  inspectorOpen: boolean
  onToggleInspector: () => void
}

export default function ChatView({
  conversationId,
  inspectorOpen,
  onToggleInspector
}: Props): React.JSX.Element {
  const queryClient = useQueryClient()
  const streamingActive = useStreamingStore((s) => s.active)
  const streamingConversationId = useStreamingStore((s) => s.conversationId)
  const beginStreaming = useStreamingStore((s) => s.begin)
  const appendAssistant = useStreamingStore((s) => s.appendAssistant)
  const pushToolEvent = useStreamingStore((s) => s.pushToolEvent)
  const pushMemoryRecall = useStreamingStore((s) => s.pushMemoryRecall)
  const clearToolEvents = useStreamingStore((s) => s.clearToolEvents)
  const endStreaming = useStreamingStore((s) => s.end)
  const failStreaming = useStreamingStore((s) => s.fail)
  const abortRef = useRef<AbortController | null>(null)

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiFetch<ConversationDTO[]>('/api/sessions')
  })
  const conversation = conversationsQuery.data?.find((c) => c._id === conversationId) ?? null

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as MessageDTO[]
      return apiFetch<MessageDTO[]>(`/api/sessions/${conversationId}/messages`)
    },
    enabled: !!conversationId
  })
  const messages = messagesQuery.data ?? []

  useEffect(() => {
    clearToolEvents()
    return () => {
      abortRef.current?.abort()
    }
  }, [clearToolEvents, conversationId])

  useKeybindAction('chat.stopStreaming', () => {
    if (!conversationId || !streamingActive || streamingConversationId !== conversationId) {
      return false
    }
    abortRef.current?.abort()
    endStreaming()
    return true
  })

  if (!conversationId || !conversation) {
    return (
      <section className="chat" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="chrome" style={{ padding: 24, textAlign: 'center' }}>
          {!conversationId ? 'Select a conversation or create a new one.' : 'Loading conversation…'}
        </div>
      </section>
    )
  }

  const handleSubmit = async (content: string, modes: TurnMode[]): Promise<void> => {
    beginStreaming(conversationId)
    abortRef.current = new AbortController()
    try {
      await streamPost(
        `/api/sessions/${conversationId}/messages`,
        { content, modes: modes.length > 0 ? modes : undefined },
        {
          signal: abortRef.current.signal,
          onEvent: (event, data) => {
            switch (event) {
              case 'assistant': {
                const text = (data as { text?: string }).text ?? ''
                if (text) appendAssistant(text)
                break
              }
              case 'tool_progress':
                pushToolEvent(data as { tool_name: string })
                break
              case 'memory_recall':
                pushMemoryRecall(data as { mode?: string; memories?: unknown[] })
                break
              case 'result':
                endStreaming()
                queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
                queryClient.invalidateQueries({ queryKey: ['conversations'] })
                queryClient.invalidateQueries({ queryKey: ['context', conversationId] })
                break
              case 'error':
                failStreaming((data as { message?: string }).message ?? 'stream_error')
                break
              default:
                break
            }
          }
        }
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        endStreaming()
      } else {
        failStreaming(error instanceof Error ? error.message : 'stream_error')
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
    }
  }

  return (
    <section className="chat">
      <ChatHeader
        conversation={conversation}
        messages={messages}
        inspectorOpen={inspectorOpen}
        onToggleInspector={onToggleInspector}
      />
      <MessageList
        conversationId={conversationId}
        messages={messages}
        modelLabel={conversation.model}
      />
      <Composer
        conversationId={conversationId}
        disabled={streamingActive && streamingConversationId === conversationId}
        onSubmit={handleSubmit}
        onCompress={async () => {
          await apiFetch<CompressResponse>(`/api/sessions/${conversationId}/compress`, {
            method: 'POST'
          })
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
          queryClient.invalidateQueries({ queryKey: ['context', conversationId] })
        }}
      />
    </section>
  )
}
