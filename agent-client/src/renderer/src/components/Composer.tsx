import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CornerDownLeft, Map } from 'lucide-react'
import ContextDisk from './ContextDisk'
import { useContextWindow } from '../hooks/useContextWindow'

type Props = {
  conversationId: string | null
  disabled: boolean
  onSubmit: (content: string) => void
}

export default function Composer({
  conversationId,
  disabled,
  onSubmit
}: Props): React.JSX.Element {
  const contextQuery = useContextWindow(conversationId)
  const [value, setValue] = useState('')
  const [isPlanMode, setIsPlanMode] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 220)}px`
  }, [value])

  const handleSubmit = (): void => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div className="composer">
      <div className={`composer-shell ${isPlanMode ? 'plan-mode' : ''}`}>
        <textarea
          ref={ref}
          className="composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={1}
          placeholder={disabled ? 'Streaming…' : 'Ask Claude anything…'}
        />
        <div className="composer-row">
          <div className="composer-meta">
            <span
              className="chrome"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <CornerDownLeft size={12} /> Enter to send
            </span>
            <span className="chrome">·</span>
            <span className="chrome mono">{value.length} chars</span>
          </div>
          <div className="composer-actions">
            <ContextDisk
              usedTokens={contextQuery.data?.usedTokens}
              totalTokens={contextQuery.data?.totalTokens}
              systemTokens={contextQuery.data?.breakdown.systemTokens}
              messageTokens={contextQuery.data?.breakdown.messageTokens}
              toolTokens={contextQuery.data?.breakdown.toolTokens}
              fileTokens={contextQuery.data?.breakdown.fileTokens}
              model={contextQuery.data?.model}
              hasData={!!contextQuery.data && contextQuery.data.usedTokens > 0}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                className={`plan-btn ${isPlanMode ? 'active' : ''}`}
                onClick={() => setIsPlanMode(!isPlanMode)}
                title="Toggle Plan Mode"
              >
                <Map size={12} />
                Plan
              </button>
              <button
                type="button"
                className="send-btn"
                onClick={handleSubmit}
                disabled={disabled || !value.trim()}
                title="Send"
              >
                <ArrowRight size={12} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
