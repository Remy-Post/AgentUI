import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import MessageList from './MessageList'
import Composer from './Composer'
import { apiFetch } from '../lib/api'
import { streamPost } from '../hooks/useSSE'
import { useStreamingStore } from '../store/streaming'
import type { MessageDTO } from '@shared/types'

type Props = {
  conversationId: string | null
}

export default function ChatView({ conversationId }: Props): React.JSX.Element {
  const queryClient = useQueryClient()
  const streaming = useStreamingStore()
  const abortRef = useRef<AbortController | null>(null)

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as MessageDTO[]
      return apiFetch<MessageDTO[]>(`/api/sessions/${conversationId}/messages`)
    },
    enabled: !!conversationId,
  })

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [conversationId])

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Select a conversation or create a new one.
      </div>
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
          },
        },
      )
    } catch (error) {
      streaming.fail(error instanceof Error ? error.message : 'stream_error')
    } finally {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <MessageList conversationId={conversationId} messages={messagesQuery.data ?? []} />
      </div>
      <Composer
        disabled={streaming.active && streaming.conversationId === conversationId}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
