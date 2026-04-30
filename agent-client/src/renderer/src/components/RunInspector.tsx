import { useMemo } from 'react'
import RailHandle from './RailHandle'
import { useStreamingStore, type MemoryRecallEvent } from '../store/streaming'
import { truncate } from '../lib/format'
import type { MessageDTO } from '@shared/types'

type Props = {
  conversationId: string | null
  messages: MessageDTO[]
  width: number
  onWidthChange: (next: number) => void
  frameRef: React.RefObject<HTMLDivElement | null>
}

function extractToolNameFromContent(content: unknown): string {
  if (typeof content === 'string') return 'tool'
  if (content && typeof content === 'object') {
    const maybe = content as { kind?: string; summary?: unknown; tool_name?: unknown }
    if (typeof maybe.tool_name === 'string') return maybe.tool_name
    if (maybe.kind === 'summary' && maybe.summary && typeof maybe.summary === 'object') {
      const inner = maybe.summary as { tool_name?: unknown }
      if (typeof inner.tool_name === 'string') return inner.tool_name
    }
  }
  return 'tool'
}

function asString(content: unknown): string {
  if (typeof content === 'string') return content
  return ''
}

type RecallRow = {
  event: MemoryRecallEvent
  memory: MemoryRecallEvent['memories'][number] | null
}

function pathBaseName(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? pathValue
}

function contentSnippet(content: string | undefined): string {
  if (!content) return ''
  return truncate(content.replace(/\s+/g, ' ').trim(), 72)
}

export default function RunInspector({
  conversationId,
  messages,
  width,
  onWidthChange,
  frameRef
}: Props): React.JSX.Element {
  const streaming = useStreamingStore()
  const isStreamingHere = streaming.active && streaming.conversationId === conversationId

  const turns = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').length,
    [messages]
  )

  // "in tokens" rolls up new + cache-creation + cache-read input tokens to
  // match what the Anthropic console reports as input. With prompt caching,
  // most input ends up in the cache fields after the first turn.
  const inputTokens = useMemo(
    () =>
      messages.reduce((acc, m) => {
        const fresh = typeof m.inputTokens === 'number' ? m.inputTokens : 0
        const cacheCreate =
          typeof m.cacheCreationInputTokens === 'number' ? m.cacheCreationInputTokens : 0
        const cacheRead =
          typeof m.cacheReadInputTokens === 'number' ? m.cacheReadInputTokens : 0
        return acc + fresh + cacheCreate + cacheRead
      }, 0),
    [messages]
  )

  const outputTokens = useMemo(
    () =>
      messages.reduce(
        (acc, m) => acc + (typeof m.outputTokens === 'number' ? m.outputTokens : 0),
        0
      ),
    [messages]
  )

  const combinedTools = useMemo(() => {
    const historical = messages
      .filter((m) => m.role === 'tool')
      .map((m) => extractToolNameFromContent(m.content))
    const live = streaming.toolEvents.map((e) => e.tool_name)
    const all = [...historical, ...live]
    const deduped: string[] = []
    for (const name of all) {
      if (deduped[deduped.length - 1] !== name) deduped.push(name)
    }
    return deduped.slice(-8)
  }, [messages, streaming.toolEvents])

  const recallRows = useMemo<RecallRow[]>(() => {
    const rows: RecallRow[] = []
    for (const event of streaming.memoryRecallEvents) {
      if (event.memories.length === 0) {
        rows.push({ event, memory: null })
        continue
      }
      for (const memory of event.memories) rows.push({ event, memory })
    }
    return rows.slice(-6)
  }, [streaming.memoryRecallEvents])

  const lastUser = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m.role === 'user' && typeof m.content === 'string') return m.content
    }
    return ''
  }, [messages])

  const lastAssistant = useMemo(() => {
    if (isStreamingHere && streaming.buffer) return streaming.buffer
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m.role === 'assistant' && typeof m.content === 'string') return m.content
    }
    return ''
  }, [messages, isStreamingHere, streaming.buffer])

  return (
    <>
      <RailHandle width={width} onWidthChange={onWidthChange} frameRef={frameRef} />

      <div className="rail-section head">
        <div className="cap">Run inspector</div>
        <div className="rail-status">{isStreamingHere ? 'Streaming response…' : 'Idle'}</div>
      </div>

      <div className="rail-section">
        <div className="rail-stat-grid">
          <div>
            <div className="cap">turns</div>
            <div className="rail-stat-value">{turns}</div>
          </div>
          <div>
            <div className="cap">in tokens</div>
            <div className="rail-stat-value">{inputTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className="cap">out tokens</div>
            <div className="rail-stat-value">{outputTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className="cap">tool calls</div>
            <div className="rail-stat-value">{combinedTools.length}</div>
          </div>
        </div>
      </div>

      <div className="rail-section">
        <div className="cap">Tool activity</div>
        {combinedTools.length === 0 ? (
          <div className="chrome" style={{ marginTop: 6 }}>
            no tools yet
          </div>
        ) : (
          <ul className="rail-tools">
            {combinedTools.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-section">
        <div className="cap">Memory recall</div>
        {recallRows.length === 0 ? (
          <div className="chrome" style={{ marginTop: 6 }}>
            no recalls yet
          </div>
        ) : (
          <ul className="rail-tools">
            {recallRows.map(({ event, memory }, i) => (
              <li className="rail-memory-ref" key={`${event.ts}-${memory?.path ?? 'empty'}-${i}`}>
                <div className="rail-memory-copy">
                  <span className="rail-memory-title">
                    {event.mode}
                    {memory ? ` · ${memory.scope} · ${pathBaseName(memory.path)}` : ' · no matches'}
                  </span>
                  {memory?.content && (
                    <span className="rail-memory-snippet">{contentSnippet(memory.content)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rail-section recap">
        <div className="cap">Last turn</div>
        {!lastUser && !lastAssistant && (
          <div className="chrome" style={{ marginTop: 6 }}>
            no messages yet
          </div>
        )}
        {lastUser && (
          <p>
            <span className="who">you:</span>
            {truncate(asString(lastUser), 220)}
          </p>
        )}
        {lastAssistant && (
          <p>
            <span className="who">claude:</span>
            {truncate(asString(lastAssistant), 220)}
          </p>
        )}
      </div>

      <div className="rail-section">
        <div className="cap">Active subagent</div>
        {/* TODO: wire when subagent invocation is exposed by streaming events */}
        <div className="mono" style={{ fontSize: 12, marginTop: 6, color: 'var(--color-ink-3)' }}>
          none
        </div>
      </div>
    </>
  )
}
