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

  const conversationsById = new Map(conversations.map((c) => [c._id, c]))

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
  const titleMatchedIds = new Set(conversationResults.map((r) => r.conversationId))
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
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setSelectedIndex(0)
              onQueryChange(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (allResults.length > 0) {
                  setSelectedIndex((activeIndex + 1) % allResults.length)
                }
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (allResults.length > 0) {
                  setSelectedIndex(activeIndex <= 0 ? allResults.length - 1 : activeIndex - 1)
                }
                return
              }
              if (e.key === 'Enter' && activeIndex >= 0) {
                e.preventDefault()
                submitSelection(allResults[activeIndex])
              }
            }}
            placeholder="Search conversations and cached messages"
            className="palette-input"
          />
          <span className="chrome">Esc</span>
        </div>

        <div className="palette-results">
          {conversationResults.length > 0 && (
            <>
              <div className="palette-section-head">
                {normalizedQuery ? 'Conversations' : 'Recent conversations'}
              </div>
              {conversationResults.map((result, index) => {
                const isSelected = index === activeIndex
                const isActive = result.conversationId === selectedConversationId
                return (
                  <button
                    key={resultKey(result)}
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => submitSelection(result)}
                    className={`palette-row ${isSelected ? 'selected' : ''}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: isSelected ? 'var(--color-active-soft)' : undefined
                    }}
                  >
                    <Search size={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {result.title}
                      </div>
                      <div className="preview">{result.subtitle}</div>
                    </div>
                    {isActive && (
                      <span
                        style={{
                          color: 'var(--color-good)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11
                        }}
                      >
                        <Check size={12} />
                        Active
                      </span>
                    )}
                  </button>
                )
              })}
            </>
          )}

          {messageResults.length > 0 && (
            <>
              <div className="palette-section-head" style={{ marginTop: 8 }}>
                Recent messages
              </div>
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
                    className={`palette-row ${isSelected ? 'selected' : ''}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: isSelected ? 'var(--color-active-soft)' : undefined
                    }}
                  >
                    <MessageSquare size={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {result.title}
                      </div>
                      <div
                        className="preview"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {result.excerpt}
                      </div>
                    </div>
                  </button>
                )
              })}
            </>
          )}

          {allResults.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }} className="chrome">
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
