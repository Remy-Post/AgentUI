import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import MessageList from './MessageList'
import Composer from './Composer'
import ChatHeader from './ChatHeader'
import { apiFetch } from '../lib/api'
import { streamPost } from '../hooks/useSSE'
import { useStreamingStore } from '../store/streaming'
import type { ConversationDTO, MessageDTO } from '@shared/types'

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
  const streaming = useStreamingStore()
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
    streaming.clearToolEvents()
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  if (!conversationId || !conversation) {
    return (
      <section className="chat" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="chrome" style={{ padding: 24, textAlign: 'center' }}>
          {!conversationId ? 'Select a conversation or create a new one.' : 'Loading conversation…'}
        </div>
      </section>
    )
  }

  const handleSubmit = async (content: string): Promise<void> => {
    streaming.begin(conversationId)
    abortRef.current = new AbortController()
    try {
      await streamPost(
        `/api/sessions/${conversationId}/messages`,
        { content },
        {
          signal: abortRef.current.signal,
          onEvent: (event, data) => {
            switch (event) {
              case 'assistant': {
                const text = (data as { text?: string }).text ?? ''
                if (text) streaming.appendAssistant(text)
                break
              }
              case 'tool_progress':
                streaming.pushToolEvent(data as { tool_name: string })
                break
              case 'result':
                streaming.end()
                queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
                queryClient.invalidateQueries({ queryKey: ['conversations'] })
                break
              case 'error':
                streaming.fail((data as { message?: string }).message ?? 'stream_error')
                break
              default:
                break
            }
          }
        }
      )
    } catch (error) {
      streaming.fail(error instanceof Error ? error.message : 'stream_error')
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
        disabled={streaming.active && streaming.conversationId === conversationId}
        onSubmit={handleSubmit}
      />
    </section>
  )
}
