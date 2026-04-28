import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, MessageSquare, Search } from 'lucide-react'
import type { ConversationDTO, MessageDTO } from '@shared/types'

type Props = {
  query: string
  selectedConversationId: string | null
  onClose: () => void
  onQueryChange: (query: string) => void
  onSelectConversation: (conversationId: string) => void
}

type CachedMessageGroup = {
  conversationId: string
  messages: MessageDTO[]
}

type CacheSnapshot = {
  conversations: ConversationDTO[]
  messageGroups: CachedMessageGroup[]
}

type ConversationResult = {
  kind: 'conversation'
  conversationId: string
  title: string
  subtitle: string
  updatedAt: string
  score: number
}

type MessageResult = {
  kind: 'message'
  conversationId: string
  title: string
  excerpt: string
  updatedAt: string
  score: number
}

type PaletteResult = ConversationResult | MessageResult

function readCacheSnapshot(queryClient: ReturnType<typeof useQueryClient>): CacheSnapshot {
  const conversations = queryClient.getQueryData<ConversationDTO[]>(['conversations']) ?? []
  const messageGroups = queryClient
    .getQueriesData<MessageDTO[]>({ queryKey: ['messages'] })
    .flatMap(([queryKey, data]) => {
      if (
        !Array.isArray(queryKey) ||
        queryKey[0] !== 'messages' ||
        typeof queryKey[1] !== 'string'
      ) {
        return []
      }

      if (!Array.isArray(data)) return []

      return [{ conversationId: queryKey[1], messages: data }]
    })

  return { conversations, messageGroups }
}

function usePaletteData(): CacheSnapshot {
  const queryClient = useQueryClient()

  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(() => onStoreChange()),
    () => readCacheSnapshot(queryClient),
    () => readCacheSnapshot(queryClient)
  )
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function compareByNewest(left: { updatedAt: string }, right: { updatedAt: string }): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

function scoreTitleMatch(title: string, query: string): number | null {
  if (!query) return 0

  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return null
  if (normalizedTitle === query) return 500
  if (normalizedTitle.startsWith(query)) return 420
  if (normalizedTitle.split(/\s+/).some((part) => part.startsWith(query))) return 360

  const index = normalizedTitle.indexOf(query)
  if (index < 0) return null

  return 280 - Math.min(index, 120)
}

function scoreMessageMatch(content: string, query: string, index: number): number {
  const trimmed = content.trim()
  if (trimmed === query) return 220
  if (trimmed.startsWith(query)) return 180
  if (content.split(/\s+/).some((part) => part.startsWith(query))) return 150
  return 120 - Math.min(index, 80)
}

function buildExcerpt(content: string, index: number, queryLength: number): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  const start = Math.max(0, index - 36)
  const end = Math.min(compact.length, index + queryLength + 56)

  let excerpt = compact.slice(start, end).trim()
  if (start > 0) excerpt = `...${excerpt}`
  if (end < compact.length) excerpt = `${excerpt}...`

  return excerpt
}

function buildConversationResults(
  conversations: ConversationDTO[],
  query: string
): ConversationResult[] {
  const sorted = [...conversations].sort(compareByNewest)

  if (!query) {
    return sorted.slice(0, 8).map((conversation) => ({
      kind: 'conversation',
      conversationId: conversation._id,
      title: conversation.title,
      subtitle: conversation.model,
      updatedAt: conversation.updatedAt,
      score: 0
    }))
  }

  return sorted
    .flatMap((conversation) => {
      const score = scoreTitleMatch(conversation.title, query)
      if (score === null) return []

      return [
        {
          kind: 'conversation' as const,
          conversationId: conversation._id,
          title: conversation.title,
          subtitle: conversation.model,
          updatedAt: conversation.updatedAt,
          score
        }
      ]
    })
    .sort((left, right) => right.score - left.score || compareByNewest(left, right))
    .slice(0, 8)
}

function buildMessageResults(
  messageGroups: CachedMessageGroup[],
  conversations: ConversationDTO[],
  query: string,
  excludedConversationIds: Set<string>
): MessageResult[] {
  if (!query) return []

  const conversationsById = new Map(
    conversations.map((conversation) => [conversation._id, conversation])
  )

  return messageGroups
    .flatMap((group) => {
      if (excludedConversationIds.has(group.conversationId)) return []

      const conversation = conversationsById.get(group.conversationId)
      if (!conversation) return []

      let bestMatch: MessageResult | null = null

      for (const message of group.messages) {
        if (
          (message.role !== 'user' && message.role !== 'assistant') ||
          typeof message.content !== 'string'
        ) {
          continue
        }

        const normalizedContent = message.content.toLowerCase()
        const index = normalizedContent.indexOf(query)
        if (index < 0) continue

        const result: MessageResult = {
          kind: 'message',
          conversationId: group.conversationId,
          title: conversation.title,
          excerpt: buildExcerpt(message.content, index, query.length),
          updatedAt: message.createdAt,
          score: scoreMessageMatch(normalizedContent, query, index)
        }

        if (
          !bestMatch ||
          result.score > bestMatch.score ||
          (result.score === bestMatch.score &&
            Date.parse(result.updatedAt) > Date.parse(bestMatch.updatedAt))
        ) {
          bestMatch = result
        }
      }

      return bestMatch ? [bestMatch] : []
    })
    .sort((left, right) => right.score - left.score || compareByNewest(left, right))
    .slice(0, 6)
}

function sectionHeading(label: string): React.JSX.Element {
  return (
    <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
      {label}
    </div>
  )
}

function resultKey(result: PaletteResult): string {
  if (result.kind === 'conversation') return `conversation:${result.conversationId}`
  return `message:${result.conversationId}:${result.updatedAt}`
}

export default function CommandPalette({
  query,
  selectedConversationId,
  onClose,
  onQueryChange,
  onSelectConversation
}: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { conversations, messageGroups } = usePaletteData()
  const normalizedQuery = normalize(query)
  const conversationResults = buildConversationResults(conversations, normalizedQuery)
  const titleMatchedIds = new Set(conversationResults.map((result) => result.conversationId))
  const messageResults = buildMessageResults(
    messageGroups,
    conversations,
    normalizedQuery,
    titleMatchedIds
  )
  const allResults = [...conversationResults, ...messageResults]
  const activeIndex =
    allResults.length === 0
      ? -1
      : selectedIndex < 0 || selectedIndex >= allResults.length
        ? 0
        : selectedIndex

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submitSelection = (result: PaletteResult): void => {
    onSelectConversation(result.conversationId)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/70 px-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Search size={16} className="text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setSelectedIndex(0)
              onQueryChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (allResults.length > 0) {
                  setSelectedIndex((activeIndex + 1) % allResults.length)
                }
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (allResults.length > 0) {
                  setSelectedIndex(activeIndex <= 0 ? allResults.length - 1 : activeIndex - 1)
                }
                return
              }

              if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault()
                submitSelection(allResults[activeIndex])
              }
            }}
            placeholder="Search conversations and cached messages"
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <div className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-500">
            Esc
          </div>
        </div>

        <div className="max-h-[28rem] overflow-y-auto py-3">
          {conversationResults.length > 0 && (
            <div>
              {sectionHeading(normalizedQuery ? 'Conversations' : 'Recent conversations')}
              <div className="space-y-1 px-2">
                {conversationResults.map((result, index) => {
                  const isSelected = index === activeIndex
                  const isActiveConversation = result.conversationId === selectedConversationId

                  return (
                    <button
                      key={resultKey(result)}
                      type="button"
                      tabIndex={-1}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => submitSelection(result)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                        isSelected
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-300 hover:bg-zinc-800/70'
                      }`}
                    >
                      <div className="mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-zinc-500">
                        <Search size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-100">{result.title}</div>
                        <div className="truncate text-xs text-zinc-500">{result.subtitle}</div>
                      </div>
                      {isActiveConversation && (
                        <div className="flex items-center gap-1 text-xs text-blue-300">
                          <Check size={12} />
                          Active
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {messageResults.length > 0 && (
            <div className="mt-4">
              {sectionHeading('Recent messages')}
              <div className="space-y-1 px-2">
                {messageResults.map((result, index) => {
                  const absoluteIndex = conversationResults.length + index
                  const isSelected = absoluteIndex === activeIndex

                  return (
                    <button
                      key={resultKey(result)}
                      type="button"
                      tabIndex={-1}
                      onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                      onClick={() => submitSelection(result)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                        isSelected
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-300 hover:bg-zinc-800/70'
                      }`}
                    >
                      <div className="mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 p-2 text-zinc-500">
                        <MessageSquare size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-100">{result.title}</div>
                        <div className="line-clamp-2 text-xs leading-5 text-zinc-500">
                          {result.excerpt}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {allResults.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-zinc-500">
              {normalizedQuery
                ? 'No matching conversations or cached messages.'
                : 'No conversations available yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
