import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MessageDTO } from '@shared/types'
import { useStreamingStore } from '../store/streaming'
import { formatToolContent } from '../lib/toolFormat'
import { formatUsd } from '../lib/format'

type Props = {
  conversationId: string
  messages: MessageDTO[]
  modelLabel?: string
}

function turnIndex(messages: MessageDTO[], target: MessageDTO, role: 'user' | 'assistant'): number {
  let count = 0
  for (const m of messages) {
    if (m.role === role) {
      count += 1
      if (m._id === target._id) return count
    }
  }
  return count
}

function renderContent(message: MessageDTO): React.ReactNode {
  if (typeof message.content === 'string') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
  }
  if (message.role === 'system' && message.content && typeof message.content === 'object') {
    const obj = message.content as { kind?: string; message?: string }
    if (obj.kind === 'error' && typeof obj.message === 'string') {
      return <p>{obj.message}</p>
    }
  }
  return (
    <pre className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
      {JSON.stringify(message.content, null, 2)}
    </pre>
  )
}

export default function MessageList({ conversationId, messages, modelLabel }: Props): React.JSX.Element {
  const {
    active,
    buffer,
    toolEvents,
    conversationId: streamingId,
    error,
  } = useStreamingStore()
  const showStreaming = active && streamingId === conversationId

  return (
    <div className="messages">
      <div className="messages-inner">
        {messages.map((m) => {
          if (m.role === 'tool') {
            return (
              <div key={m._id} className="msg-row tool">
                <span className="tool-ribbon">
                  <span className="text">{formatToolContent(m.content)}</span>
                </span>
              </div>
            )
          }

          if (m.role === 'system') {
            return (
              <div key={m._id} className="msg-row system">
                <div className="bubble">
                  <div className="bubble-head">
                    <span className="badge system">System</span>
                  </div>
                  <div className="bubble-body prose">{renderContent(m)}</div>
                </div>
              </div>
            )
          }

          const idx = turnIndex(messages, m, m.role)
          const isUser = m.role === 'user'
          return (
            <div key={m._id} className={`msg-row ${m.role}`}>
              <div className="bubble">
                <div className="bubble-head">
                  {isUser ? (
                    <>
                      <span className="badge user">You</span>
                      <span className="chrome">#{idx}</span>
                    </>
                  ) : (
                    <>
                      <span className="chrome">#{idx}</span>
                      <span className="badge assistant">Claude</span>
                    </>
                  )}
                </div>
                <div className="bubble-body prose">{renderContent(m)}</div>
                {!isUser && (
                  <div className="bubble-foot">
                    <span className="model-tag">
                      {modelLabel ?? 'claude'}
                      {typeof m.costUsd === 'number' && m.costUsd > 0 ? ` · ${formatUsd(m.costUsd)}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {showStreaming && (
          <div className="msg-row assistant">
            <div className="bubble">
              <div className="bubble-head">
                <span className="chrome">streaming</span>
                <span className="badge assistant">Claude</span>
              </div>
              <div className="bubble-body prose">
                {buffer ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{buffer}</ReactMarkdown>
                ) : (
                  <p style={{ color: 'var(--color-muted)' }}>working…</p>
                )}
                <span className="cursor" />
              </div>
            </div>
          </div>
        )}

        {showStreaming && toolEvents.length > 0 && (
          <div className="msg-row tool">
            <span className="tool-ribbon">
              <span className="text">
                {toolEvents
                  .slice(-3)
                  .map((t) => t.tool_name)
                  .join(' · ')}
              </span>
            </span>
          </div>
        )}

        {error && (
          <div className="msg-row system">
            <div className="bubble">
              <div className="bubble-head">
                <span className="badge system">Error</span>
              </div>
              <div className="bubble-body prose">
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
