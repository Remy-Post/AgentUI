import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MessageDTO } from '@shared/types'
import { useStreamingStore } from '../store/streaming'

type Props = {
  conversationId: string
  messages: MessageDTO[]
}

function roleLabel(role: MessageDTO['role']): string {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'Claude'
  if (role === 'tool') return 'Tool'
  return 'System'
}

function roleClass(role: MessageDTO['role']): string {
  if (role === 'user') return 'border-blue-700/60 bg-blue-950/20'
  if (role === 'assistant') return 'border-zinc-700 bg-zinc-900/40'
  if (role === 'tool') return 'border-amber-700/40 bg-amber-950/20 text-zinc-300'
  return 'border-red-700/40 bg-red-950/20 text-zinc-300'
}

function renderContent(message: MessageDTO): React.ReactNode {
  if (typeof message.content === 'string') {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} >
        {message.content}
      </ReactMarkdown>
    )
  }
  return <pre className="whitespace-pre-wrap text-xs text-zinc-400">{JSON.stringify(message.content, null, 2)}</pre>
}

export default function MessageList({ conversationId, messages }: Props): React.JSX.Element {
  const { active, buffer, toolEvents, conversationId: streamingId, error } = useStreamingStore()
  const showStreaming = active && streamingId === conversationId

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-6 py-4">
      {messages.map((m) => (
        <article
          key={m._id}
          className={`max-w-3xl rounded-lg border px-4 py-3 ${roleClass(m.role)}`}
        >
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{roleLabel(m.role)}</div>
          <div className="prose prose-invert prose-sm max-w-none">{renderContent(m)}</div>
        </article>
      ))}

      {showStreaming && buffer && (
        <article className="max-w-3xl rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Claude (streaming)</div>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{buffer}</ReactMarkdown>
          </div>
        </article>
      )}

      {showStreaming && toolEvents.length > 0 && (
        <div className="max-w-3xl rounded-md border border-amber-700/40 bg-amber-950/10 px-3 py-2 text-xs text-amber-200">
          {toolEvents.slice(-3).map((t, i) => (
            <div key={i}>tool: {t.tool_name}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="max-w-3xl rounded-md border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
